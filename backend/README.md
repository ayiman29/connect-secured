# Course Advising and Registration API
:)<br>
A backend REST API built with **Express.js** and **MySQL** for managing university course advising and registration workflows.
It is part of a full-stack project, and the frontend can be found here:
**[https://github.com/tahi4/connect-advising-frontend](https://github.com/tahi4/connect-advising-frontend)**

## Directory Structure
```
app.js
db.js
controllers/
middleware/
models/
routes/
package.json
.gitignore
misc
````

## Installation
```bash
npm install
````

Copy environment template and set real values:

```bash
cp .env.example .env
```

Set up MySQL database and configure `.env` values.

## Run

```bash
npm run dev
```

## CRYPTOGRAPHY

This section describes how the API protects user authentication data and user personally identifiable information (PII). The implementation is application-layer encryption: values are encrypted before they are written to MySQL and decrypted only when the application needs to use or return them.

### Encrypted User Information

During registration, the user's normalized email address and name are encrypted before insertion into the `user` table. The database stores these values in `email_encrypted` and `name_encrypted`.

The current implementation uses the existing `crypto101` RSA bridge for server-only user PII and TOTP secrets. The server encrypts these values with a dedicated RSA public key and decrypts them with the matching RSA private key. RSA payloads are processed in 40-character chunks by the Python bridge.

```javascript
const ciphertext = await encryptWithRsa(String(plainText));
```

The stored RSA value contains colon-separated numeric ciphertext chunks:

```text
chunk_1:chunk_2:chunk_3
```

When the value is retrieved, the application passes the ciphertext to the Python bridge with the server's private key. The bridge decrypts each chunk and joins the recovered plaintext before it is used by the model layer.

```javascript
const plaintext = await decryptWithRsa(ciphertext);
```

### Password Protection

Passwords are not encrypted because passwords should not be recoverable. They are hashed with bcrypt, which generates and stores a salt as part of the resulting hash. During login, bcrypt compares the submitted password with the stored hash.

```javascript
const hashedPassword = await bcrypt.hash(password, 10);
const passwordMatches = await bcrypt.compare(password, user.password);
```

### Integrity Protection

RSA encryption in the educational `crypto101` bridge provides confidentiality for server-only PII and TOTP values. The current RSA payload format does not include an authenticated-encryption tag, so deployments should protect the RSA key file and database access carefully. A tamper-evident integrity check is provided for chat message bodies by AES-GCM: its authentication tag detects changes to the ciphertext, IV, or tag, and failed verification prevents the message from being returned.

The API also uses **HMAC-SHA256** with a separate secret key to create a deterministic, protected lookup value for email addresses. This allows the application to find a user without storing a plaintext email or using the encrypted email value as a database lookup key.

```javascript
const digest = crypto
	.createHmac('sha256', lookupKey)
	.update(normalizedEmail, 'utf8')
	.digest('hex');

const emailLookup = `${LOOKUP_KEY_VERSION}:${digest}`;
```

The HMAC key is separate from the RSA and chat keys. A database user who does not have the application secrets cannot create valid email lookup values or decrypt protected payloads.

### Two-Factor Authentication (2FA)

Login uses a two-step TOTP-based authentication flow. The first step verifies the user's email, password, and role. It does not issue the normal session token. Instead, it issues a short-lived JWT with the stage `pre-auth` and a five-minute expiration.

The second step requires a six-digit time-based one-time password from an authenticator application. Only after the TOTP code is verified does the backend issue the normal one-hour session JWT used by protected routes.

The flow is:

1. `POST /auth/login` verifies the bcrypt password and returns `preAuthToken` plus the account's `totp_enabled` status.
2. A new account, or an account without completed enrollment, calls `POST /auth/setup-totp` with the pre-auth token. The backend generates a TOTP secret, stores an encrypted copy, and returns an `otpauth://` URL and QR-code data for an authenticator app.
3. The user enters the authenticator code through `POST /auth/verify-totp`.
4. The backend decrypts the stored secret, validates the code with a one-step clock-skew window, enables TOTP on first successful verification, and returns the full session token.

The TOTP secret is encrypted with the server RSA public key before storage. It is never returned as plaintext by the API. Passwords remain bcrypt hashes and are never decrypted.

```javascript
// Step 1: password verification returns a limited pre-auth token.
const preAuthToken = issuePreAuthToken(user.user_id);

// Step 2: the secret is encrypted before it is stored.
const encryptedSecret = await encryptWithRsa(plaintextSecret);

// Step 3: the secret is decrypted only inside the verification path.
const plaintextSecret = await decryptWithRsa(user.totp_secret);
const valid = speakeasy.totp.verify({
	secret: plaintextSecret,
	encoding: 'base32',
	token: String(code).replace(/\s/g, ''),
	window: 1,
});
```

The pre-auth token is intentionally accepted only by the enrollment and verification handlers. It is not a replacement for the full session token and cannot be used to access student, advisor, registrar, or chat routes.

### Key Configuration and Versions

The application loads cryptographic secrets from environment variables rather than storing them in the database:

- `EMAIL_LOOKUP_KEY`: separate 32-byte HMAC key encoded as 64 hexadecimal characters.
- `EMAIL_LOOKUP_KEY_VERSION`: active lookup key version, default `v1`.
- `CRYPTO101_PATH`: optional path to the existing `crypto101` Python package.
- `PYTHON_PATH`: optional Python executable path used to run `crypto101_bridge.py`.
- `JWT_SECRET`: separate secret used to sign authentication tokens.

The server RSA key pair is generated through `crypto101` and saved to `config/server_rsa_keys.json` on first startup. Keep this file private and back it up securely; losing the private key makes existing RSA-encrypted PII and TOTP secrets unreadable.

```javascript
await ensureServerKeys();
```

`EMAIL_LOOKUP_KEY` must remain because email lookup continues to use HMAC-SHA256. Legacy conversion utilities are separate from the normal runtime flow.

### Key Management and ECC Private-Key Protection

The backend uses a dedicated key-management service for the server RSA key used to protect server-only secrets and chat key material. The service:

- Generates the server RSA key pair through `crypto101` if it does not exist.
- Loads the active key before the server accepts requests.
- Stores key-version metadata separately from the database.
- Keeps retired RSA key backups so versioned ciphertext can still be read during rotation.
- Prevents key files and metadata from being committed through `.gitignore`.

The key files are local educational-project storage. In production, replace this storage with a KMS or vault such as Azure Key Vault, AWS KMS, or HashiCorp Vault. The database should never be the source of truth for master private keys.

Chat ECC private keys are no longer stored as plaintext in `user_ecc_key.private_key`. They are encrypted with the managed server RSA key and stored as `private_key_encrypted`. The backend decrypts the ECC private scalar only in memory when it needs to unwrap a chat session key; it is never sent to the frontend.

To rotate the server key, use the internal `rotateManagedKey()` operation from a controlled administrative script. The previous key is retained as `server_rsa_keys_<version>.json` until all ciphertext created with that version has been re-encrypted. Never delete a retired key before its data has been verified.

### Encrypted Course and Section Data

Course and section descriptive fields are encrypted with the server RSA key before they are stored:

- Course title
- Course name
- Exam schedule
- Section schedule
- Faculty name

The backend decrypts these fields before returning course lists, course details, selected courses, available sections, advisor views, or registrar updates. Course IDs, section IDs, course credits, seat availability, and relationship IDs remain numeric operational values because the database and transaction logic must use them for joins, credit calculations, schedule checks, and seat updates.

The flow is:

1. A registrar submits course or section information.
2. The registrar model calls `encryptCourseFields()` or `encryptSectionFields()`.
3. RSA ciphertext is stored in the corresponding `*_encrypted` columns.
4. Student and advisor models call the matching decryption helpers before building API responses.
5. The frontend receives normal course names and schedules and never sees database ciphertext.

This protects the descriptive course data at rest while preserving the numeric values required for registration transactions.

### Profile and Account Menu

Registration accepts optional address and phone values. These values are encrypted with RSA before being written to `address_encrypted` and `phone_encrypted` in the `user` table. Existing profile fields are never returned as database ciphertext.

Authenticated users can use:

- `GET /auth/profile` to view the decrypted profile.
- `PUT /auth/profile` to update name, email, address, and phone.

The frontend account control is a three-dot menu. It provides:

- **View profile:** read-only display of name, email, address, and phone.
- **Edit profile:** editable fields with save and cancel controls.
- **Log out:** removes the local session token and user data.

The profile view intentionally contains no edit control; editing is available only through the separate menu option.

### Serial Implementation Change Record

The following record lists the implemented security changes in the order a request flows through the system. It also identifies the main files changed for each feature. Migration and conversion scripts are listed for traceability only; the normal runtime flow is handled by the application files below.

#### 1. Cryptography bridge and RSA key services

The Python bridge connects Node.js to the existing `crypto101` RSA implementation. The RSA service manages the registrar key pair for reports and the server key pair for PII, TOTP, comments, and course data.

**Runtime order:** `app.js` -> `keyManagementService.js` -> `crypto101RsaService.js` -> `crypto101_bridge.py` -> `crypto101` RSA implementation.

**Files:**

- `backend/app.js`: initializes managed RSA keys before accepting requests.
- `backend/lib/security/crypto101RsaService.js`: starts the Python bridge, generates/loads keys, encrypts, and decrypts RSA chunks.
- `backend/lib/security/keyManagementService.js`: adds active key versions, retired-key support, managed encryption, and rotation metadata.
- `backend/scripts/crypto101_bridge.py`: exposes RSA and ECC bridge commands.
- `backend/config/server_rsa_keys.json`: local server RSA key material, ignored by Git.
- `backend/config/server_key_metadata.json`: local active/retired key metadata, ignored by Git.

#### 2. User registration and encrypted account data

**Runtime order:** `POST /auth/signup` -> `authController.js` -> role model -> `userModel.js` -> RSA service -> `user` table.

**Files:**

- `backend/routes/authRoutes.js`: exposes `/auth/signup`.
- `backend/controllers/authController.js`: validates registration input and passes address/phone through.
- `backend/models/studentModel.js`: creates student records and forwards profile fields.
- `backend/models/advisorModel.js`: creates advisor records and forwards profile fields.
- `backend/models/registrarModel.js`: creates registrar records and forwards profile fields.
- `backend/models/userModel.js`: hashes passwords with bcrypt, encrypts email/name/address/phone with RSA, and creates the HMAC email lookup.
- `backend/migrations/university5_encrypted_schema.sql`: defines encrypted user columns for a clean schema.

Stored account fields:

```text
email_encrypted
name_encrypted
address_encrypted
phone_encrypted
password              bcrypt hash, not encryption
email_lookup          HMAC-SHA256 lookup value
```

#### 3. Login, TOTP enrollment, and two-factor verification

**Runtime order:** `POST /auth/login` -> password lookup/decryption -> bcrypt comparison -> pre-auth JWT -> TOTP setup or verification -> full session JWT.

**Files:**

- `backend/routes/authRoutes.js`: exposes `/auth/login`, `/auth/setup-totp`, and `/auth/verify-totp`.
- `backend/controllers/authController.js`: issues the five-minute pre-auth token, generates the TOTP QR code, decrypts the RSA-protected TOTP secret, verifies the code, and issues the one-hour session token.
- `backend/models/userModel.js`: stores the TOTP secret using RSA and tracks `totp_enabled`.
- `backend/middleware/authMiddleware.js`: verifies the full JWT for protected routes.
- `frontend/vite-project/src/AuthView.jsx`: renders login, TOTP enrollment, and TOTP verification screens.

The pre-auth token cannot access protected application routes. A full session token is issued only after the second factor succeeds.

#### 4. Course and section descriptive-data encryption

**Write order:** registrar form -> registrar route/controller -> `registrarModel.js` -> `courseCryptoService.js` -> RSA service -> encrypted course/section columns.

**Read order:** student/advisor route/controller -> student/advisor model -> `courseCryptoService.js` -> RSA service -> normal frontend response.

**Files:**

- `backend/controllers/registrarController.js`: receives course and section values.
- `backend/models/registrarModel.js`: encrypts title, name, exam schedule, schedule, and faculty on write.
- `backend/lib/security/courseCryptoService.js`: groups course/section RSA field encryption and decryption.
- `backend/models/studentModel.js`: decrypts course data and decrypts schedule values for clash checks.
- `backend/models/advisorModel.js`: decrypts course data for advisor views and waiting-student views.
- `backend/migrations/university5_encrypted_schema.sql`: defines encrypted course/section columns in a clean schema.

Numeric IDs, course credits, seat availability, and relationship values remain operational database values for joins and transactions.

#### 5. RSA-encrypted student problem reports

**Student write order:** student form -> `POST /students/report` -> `studentController.js` -> `crypto101RsaService.js` registrar public key -> `reportModel.js` -> `report.encrypted_problem`.

**Registrar read order:** registrar report list -> `GET /registrars/reports` -> `reportModel.js` decrypts student name -> registrar selects a report -> `POST /registrars/reports/:reportId/decrypt` -> registrar private key -> normal problem text.

**Files:**

- `frontend/vite-project/src/StudentView.jsx`: submits a normal problem description without exposing encryption details.
- `frontend/vite-project/src/RegistrarView.jsx`: lists reports, displays decrypted content on request, and marks reports done.
- `backend/controllers/studentController.js`: encrypts submitted report text.
- `backend/controllers/registrarController.js`: authorizes report access and decrypts report text.
- `backend/models/reportModel.js`: stores and retrieves report ciphertext and decrypts student names with server RSA.
- `backend/lib/security/crypto101RsaService.js`: manages the registrar RSA pair and report encryption.
- `backend/migrations/report_schema.sql`: defines the report ciphertext column.

#### 6. ECC-protected student-advisor chat

**Session creation order:** chat UI -> `GET /chat/session` -> `chatController.js` -> `chatModel.js` -> ECC key generation -> ECC-wrapped shared AES session key -> `chat_session`.

**Message write order:** chat UI -> `POST /chat/send` -> participant authorization -> ECC private-key unwrap -> AES-GCM encryption -> HMAC-SHA256 MAC -> `chat_message`.

**Message read order:** chat UI -> `GET /chat/messages/:sessionId` -> participant authorization -> ECC private-key unwrap -> HMAC verification -> AES-GCM tag verification -> AES-GCM decryption -> normal message text.

**Files:**

- `frontend/vite-project/src/ChatWidget.jsx`: handles advisor/student selection, message display, polling, and sending.
- `frontend/vite-project/src/ChatWidget.css`: styles the chat drawer.
- `backend/routes/chatRoutes.js`: exposes chat session, advisor list, contacts, message, and send routes.
- `backend/controllers/chatController.js`: enforces participant ownership, unwraps keys, applies encryption, and verifies MACs.
- `backend/models/chatModel.js`: stores sessions/messages and encrypts/decrypts ECC private keys through key management.
- `backend/lib/security/chatCryptoService.js`: performs ECC bridge calls, AES-GCM message encryption, and HMAC-SHA256 MAC creation/verification.
- `backend/migrations/chat_schema.sql`: defines ECC key, session, and encrypted message storage.
- `backend/migrations/add_chat_mac.sql`: adds the explicit message MAC column for existing chat schemas.

Integrity layers:

1. ECC protects the shared session key for each participant.
2. AES-GCM protects message confidentiality and supplies an authentication tag.
3. HMAC-SHA256 covers message ciphertext and sender/session metadata.

#### 7. RSA protection for ECC private keys

**Runtime order:** chat model requests user ECC keys -> managed key service decrypts the versioned RSA envelope -> private ECC scalar exists only in backend memory -> ECC unwraps the chat session key.

**Files:**

- `backend/models/chatModel.js`: stores `private_key_encrypted` and decrypts it only when needed.
- `backend/lib/security/keyManagementService.js`: adds the versioned RSA envelope around the ECC private key.
- `backend/migrations/encrypt_ecc_private_keys.sql`: defines the encrypted key column for an existing chat schema.
- `backend/scripts/migrateEccPrivateKeys.js`: conversion utility retained for database history.

#### 8. Shared Comment section

**Create order:** Comment form -> `POST /comments` -> `commentController.js` -> `commentModel.js` -> RSA encryption -> `comment.content_encrypted`.

**Read order:** Comment section -> `GET /comments` -> expiry cleanup -> RSA decryption -> author/content response.

**Edit/delete order:** Comment action -> `PUT` or `DELETE /comments/:commentId` -> JWT ownership check -> encrypted update or deletion. Registrars may delete any comment; other roles may delete only their own.

**Files:**

- `frontend/vite-project/src/CommentSection.jsx`: shared create/view/edit/delete UI for all roles.
- `frontend/vite-project/src/CommentSection.css`: Comment section presentation.
- `backend/routes/commentRoutes.js`: exposes comment endpoints for all authenticated roles.
- `backend/controllers/commentController.js`: validates content and enforces permissions.
- `backend/models/commentModel.js`: encrypts content, decrypts responses, and removes expired comments.
- `backend/migrations/comment_schema.sql`: defines 24-hour comment expiry storage.
- `backend/app.js`: runs expiry cleanup at startup and every ten minutes.

#### 9. Profile editing and account controls

**Registration order:** signup form -> `POST /auth/signup` -> role model -> `userModel.js` -> RSA-encrypted address/phone.

**View order:** three-dot menu -> View profile -> `GET /auth/profile` -> read-only profile display.

**Edit order:** three-dot menu -> Edit profile -> `GET /auth/profile` -> edit form -> `PUT /auth/profile` -> RSA-encrypted update.

**Logout order:** three-dot menu or profile dialog -> logout handler -> local JWT/user removal -> login screen.

**Files:**

- `frontend/vite-project/src/AuthView.jsx`: collects address and phone during registration.
- `frontend/vite-project/src/ProfileMenu.jsx`: three-dot menu, read-only profile view, edit profile view, and logout controls.
- `frontend/vite-project/src/ProfileMenu.css`: account menu and profile dialog styles.
- `frontend/vite-project/src/App.jsx`: mounts the account menu and owns logout/session state.
- `backend/routes/authRoutes.js`: exposes authenticated profile endpoints.
- `backend/controllers/authController.js`: handles profile reads and updates.
- `backend/models/userModel.js`: encrypts and decrypts profile fields.
- `backend/migrations/add_profile_fields.sql`: defines address and phone columns for an existing schema.

### Student Problem Reports

Problem reports use the project's `crypto101` RSA service. The student sends the problem text to the backend, where it is encrypted with the registrar's RSA public key before being stored in `report.encrypted_problem`. The registrar retrieves the report and the backend decrypts it with the registrar's private key. The private key is kept outside the database and is used only by the backend decryption flow.

```javascript
// Student flow: encrypt before inserting into MySQL
const encryptedProblem = await encryptProblemReport(problemText);
await reportModel.createReport(studentId, encryptedProblem);

// Registrar flow: decrypt after retrieving the ciphertext
const decrypted = await decryptProblemReport(report.encrypted_problem);
```

The report table stores RSA ciphertext, not the student's plaintext problem:

```sql
CREATE TABLE `report` (
	`report_id` INT NOT NULL AUTO_INCREMENT,
	`student_id` INT NOT NULL,
	`encrypted_problem` LONGTEXT NOT NULL,
	`created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY (`report_id`)
);
```

### SQL Inspection Commands

These MySQL commands can be used to verify the protected data stored by the backend. Run them against the configured university database:

```sql
-- Confirm that the encrypted user columns exist.
DESCRIBE user;

-- Inspect protected user fields without selecting plaintext PII.
SELECT
	user_id,
	LEFT(email_encrypted, 24) AS email_ciphertext_sample,
	CHAR_LENGTH(email_encrypted) AS email_ciphertext_length,
	email_lookup,
	LEFT(name_encrypted, 24) AS name_ciphertext_sample,
	CHAR_LENGTH(name_encrypted) AS name_ciphertext_length,
	pii_key_version,
	LEFT(password, 7) AS password_hash_prefix
FROM user;

-- Verify that email lookup values are versioned HMAC values.
SELECT user_id, email_lookup
FROM user;

-- Confirm the problem-report table and its protected column.
DESCRIBE report;

-- Inspect report metadata and ciphertext without revealing the problem text.
SELECT
	report_id,
	student_id,
	created_at,
	CHAR_LENGTH(encrypted_problem) AS ciphertext_length,
	LEFT(encrypted_problem, 40) AS ciphertext_sample
FROM report
ORDER BY created_at DESC;

-- Count reports currently awaiting registrar review.
SELECT COUNT(*) AS open_report_count
FROM report;
```

These SQL queries intentionally do not decrypt values. AES keys, HMAC keys, RSA keys, and the decryption logic remain outside MySQL. Use the authenticated API endpoints below to retrieve user-facing values or view a report through the backend.

### Encrypted Student-Advisor Chat

Chat uses a hybrid design so that ECC protects the session key and AES-GCM protects message content:

#### 1. Participant key pairs

When a user first starts or joins a chat, the backend generates an ECC key pair through the project's `crypto101` bridge. The public coordinates identify the participant's key, while the private scalar is used by the backend to unwrap that participant's session key.

#### 2. Per-conversation session key

When a student and advisor start a new conversation, the backend generates one random curve point and derives a 32-byte AES key from that point. The same AES key is encrypted twice with ECC: once for the student's public key and once for the advisor's public key. The conversation stores both encrypted key packages, so either authorized participant can recover the session key with their own private key.

This means the student can choose any advisor returned by `GET /chat/advisors`, and each student-advisor pair has its own `chat_session` record. The unique student/advisor constraint prevents duplicate sessions.

#### 3. Message confidentiality and integrity

Before a message is stored, the backend recovers the participant's AES session key and encrypts the trimmed message with AES-256-GCM. Every message receives a fresh random 12-byte IV and a GCM authentication tag. The backend also calculates an HMAC-SHA256 MAC over the session ID, sender role, sender ID, ciphertext, IV, and GCM tag. The database stores only protected message data in `chat_message`.

```javascript
const iv = crypto.randomBytes(12);
const cipher = crypto.createCipheriv('aes-256-gcm', aesKey, iv);
const ciphertext = Buffer.concat([
	cipher.update(message, 'utf8'),
	cipher.final(),
]);
const authTag = cipher.getAuthTag();
```

During retrieval, the backend unwraps the session key, verifies the HMAC with a timing-safe comparison, then verifies the GCM authentication tag and decrypts each message. If the ciphertext, sender metadata, IV, MAC, or tag was changed, the message is rejected or decryption fails and the modified message is not returned as trusted text.

#### 4. Authorization and participant access

All `/chat` routes require a valid full JWT. The backend also checks that the authenticated student owns the requested student side of the session or that the authenticated advisor owns the advisor side. A user cannot read or send messages to an unrelated session by changing a session ID.

The advisor contact list is limited to the authenticated advisor's existing chat sessions. The student advisor list is restricted to the student role. The frontend displays message text and timestamps only; ECC keys, AES keys, IVs, tags, and ciphertext are never shown to users.

#### 5. Chat storage layout

```text
user_ecc_key
	user_id, public_key_x, public_key_y, private_key_encrypted

chat_session
	student_id, advisor_id
	student_encrypted_key, advisor_encrypted_key

chat_message
	session_id, sender_role, sender_id
	ciphertext, iv, auth_tag, mac, created_at
```

The current implementation stores ECC key material in the application database so the backend can perform the unwrap operation. Production deployments should protect database access and consider moving private key storage to a dedicated key-management service. MySQL inspection can confirm the presence of protected fields, but it cannot decrypt chat messages without the backend keys and crypto services.

### Cryptography Inspection SQL

Use these commands to inspect chat and 2FA storage without selecting plaintext message content or TOTP secrets:

```sql
-- Confirm 2FA columns and encrypted secret metadata.
DESCRIBE user;

SELECT
	user_id,
	totp_enabled,
	CASE WHEN totp_secret IS NULL THEN 'not enrolled' ELSE 'encrypted secret stored' END AS totp_status,
	CHAR_LENGTH(totp_secret) AS encrypted_totp_length
FROM user;

-- Confirm ECC participant key records.
DESCRIBE user_ecc_key;

SELECT user_id, CHAR_LENGTH(public_key_x) AS public_x_length,
			 CHAR_LENGTH(public_key_y) AS public_y_length,
				 CHAR_LENGTH(private_key_encrypted) AS encrypted_private_key_length,
			 created_at
FROM user_ecc_key;

-- Inspect chat sessions without exposing wrapped key contents.
SELECT
	session_id,
	student_id,
	advisor_id,
	CHAR_LENGTH(student_encrypted_key) AS student_key_package_length,
	CHAR_LENGTH(advisor_encrypted_key) AS advisor_key_package_length,
	created_at
FROM chat_session;

-- Inspect message metadata and protected payload lengths only.
SELECT
	message_id,
	session_id,
	sender_role,
	sender_id,
	CHAR_LENGTH(ciphertext) AS ciphertext_length,
	CHAR_LENGTH(iv) AS iv_length,
	CHAR_LENGTH(auth_tag) AS auth_tag_length,
	CHAR_LENGTH(mac) AS mac_length,
	created_at
FROM chat_message
ORDER BY created_at DESC;
```

Do not run `SELECT totp_secret`, `SELECT private_key_encrypted`, `SELECT ciphertext`, or the wrapped session-key columns when demonstrating the system. Those values are protected backend data, not user-facing output. Use the authenticated API and the crypto services for enrollment, message delivery, authentication-tag verification, and decryption.

## API Endpoints

### Auth

| Method | Endpoint | Params / Body                  |
| ------ | -------- | ------------------------------ |
| POST   | /auth/signup | name, email, password, role, address, phone |
| POST   | /auth/login  | email, password, role       |
| POST   | /auth/setup-totp | preAuthToken              |
| POST   | /auth/verify-totp | preAuthToken, code       |
| GET    | /auth/profile | - |
| PUT    | /auth/profile | name, email, address, phone |

---

### Student

> All routes require authentication with role = `student`

| Method | Endpoint                                  | Params / Body                                   |
| ------ | ----------------------------------------- | ----------------------------------------------- |
| GET    | /students/courses                         | -                                               |
| GET    | /students/courses/:courseId               | courseId                                        |
| POST   | /students/add-course                      | studentId, courseId, sectionId, advisorId       |
| POST   | /students/drop-course                     | studentId, courseId, sectionId                  |
| POST   | /students/report                          | studentId, problemText                          |
| GET    | /students/my-courses/:studentId           | studentId                                       |
| GET    | /students/info/:studentId                 | studentId                                       |
| PUT    | /students/confirm-advising/:studentId     | studentId                                       |
| GET    | /students/id-by-email/:email              | email                                            |

---

### Advisor

> All routes require authentication with role = `advisor`

| Method | Endpoint                         | Params / Body                                                                           |
| ------ | -------------------------------- | ----------------------------------------------------------------------------------------|
| GET    | /advisors/waiting-students       | -                                                                                       |
| PUT    | /advisors/approve/:studentId     | studentId, status (`approved` / `denied`)                                               |
| POST   | /advisors/add-course             | studentId, courseId, sectionId                                                          |
| POST   | /advisors/drop-course            | studentId, courseId, sectionId                                                          |
| GET    | /advisors/student-courses/:studentId | studentId     [For fetching selected courses by students]                           |
| GET    | /advisors/courses/:studentId    | studentId          [For fetching all courses other than the selected ones by a student]  | 
| GET    | /advisors/course-detail/:courseId | courseId                                                                               | 
| GET    | /advisors/id-by-email/:email       | email                                                                                 |

---

### Registrar

> All routes require authentication with role = `registrar`

| Method | Endpoint                                  | Params / Body                                                    |
| ------ | ----------------------------------------- | ---------------------------------------------------------------- |
| POST   | /registrars/course                         | courseId, title, name, examSchedule, courseCredit, registrarId |
| DELETE | /registrars/course/:courseId               | courseId                                                         |
| POST   | /registrars/section                        | courseId, sectionId, schedule, faculty, seatAvailability         |
| DELETE | /registrars/section/:courseId/:sectionId   | courseId, sectionId                                              |
| GET    | /registrars/reports                        | -                                                                |
| POST   | /registrars/reports/:reportId/decrypt      | reportId                                                         |
| DELETE | /registrars/reports/:reportId              | reportId                                                         |

---

### Chat

Chat routes require the full session token issued after 2FA. Students can choose an advisor from `/chat/advisors`; advisors can choose from their student contacts or provide a `studentId` when opening a conversation.

| Method | Endpoint                         | Params / Body             |
| ------ | -------------------------------- | ------------------------- |
| GET    | /chat/session                    | advisor: `studentId`      |
| GET    | /chat/advisors                   | -                         |
| GET    | /chat/messages/:sessionId       | sessionId                 |
| POST   | /chat/send                      | sessionId, text           |
| GET    | /chat/advisor/contacts          | -                         |

---

### Comment

The Comment section is a short-lived shared discussion area at the end of each student, advisor, and registrar view. It is intended for announcements, quick updates, course questions, and general coordination between authenticated users. It is separate from private student-advisor chat: comments are visible to all authenticated users, while chat messages are limited to the two participants in a conversation.

#### Comment lifecycle

1. An authenticated student, advisor, or registrar submits text through the Comment form.
2. The backend validates the content, limits it to 2,000 characters, encrypts it with the server RSA public key, and stores only the encrypted value in `comment.content_encrypted`.
3. The backend decrypts the content when an authenticated user requests the comment list. The frontend displays the author, content, creation time, and expiration time, but never displays ciphertext or keys.
4. Every comment receives an `expires_at` timestamp exactly 24 hours after creation.
5. Expired comments are excluded from queries and deleted by the backend cleanup task, which runs at startup and every ten minutes. This means comments are removed no later than the next cleanup interval after their 24-hour lifetime.

#### Permissions

| Operation | Student | Advisor | Registrar |
| --------- | ------- | ------- | --------- |
| View active comments | Yes | Yes | Yes |
| Add a comment | Yes | Yes | Yes |
| Edit own comment | Yes | Yes | Yes |
| Delete own comment | Yes | Yes | Yes |
| Delete another user's comment | No | No | Yes |

Ownership is enforced by the backend using the authenticated user's `userId` from the JWT. The frontend controls are only a convenience; changing a request manually cannot bypass the owner check. Registrars are allowed to delete any comment for moderation.

#### Encrypted storage

The comment body is encrypted before insertion:

```javascript
const encryptedContent = await encryptWithRsa(content);

await pool.query(
	`INSERT INTO comment
		(user_id, content_encrypted, created_at, expires_at)
	 VALUES (?, ?, NOW(), DATE_ADD(NOW(), INTERVAL 24 HOUR))`,
	[userId, encryptedContent]
);
```

The `comment` table does not contain a plaintext content column:

```sql
CREATE TABLE comment (
	comment_id INT AUTO_INCREMENT PRIMARY KEY,
	user_id INT NOT NULL,
	content_encrypted LONGTEXT NOT NULL,
	created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
	expires_at DATETIME NOT NULL,
	FOREIGN KEY (user_id) REFERENCES user(user_id) ON DELETE CASCADE
);
```

#### API

All endpoints require the full authenticated session token issued after 2FA:

| Method | Endpoint | Body / behavior |
| ------ | -------- | --------------- |
| GET | `/comments` | Returns active, decrypted comments. Expired comments are removed first. |
| POST | `/comments` | `{ "content": "..." }`; creates a comment owned by the JWT user. |
| PUT | `/comments/:commentId` | `{ "content": "..." }`; only the owner can edit before expiry. |
| DELETE | `/comments/:commentId` | The owner can delete their own comment; a registrar can delete any comment. |

The frontend automatically refreshes the Comment section periodically, so expired comments disappear from the interface without exposing implementation details to users.



## ER and Schema

### ER Diagram
<img width="993" height="673" alt="image" src="https://github.com/user-attachments/assets/34b7eec4-6f4a-4199-a7e1-81366552e53b" />

---

### Schema Diagram
<img width="864" height="705" alt="image" src="https://github.com/user-attachments/assets/4f7c64eb-298d-4881-97c8-c538e0479726" />

## Notes

* All course addition endpoints handle: credit limit, schedule clash, seat availability, and section swaps.
* Transactions ensure data consistency for add/drop operations.
* Endpoints are grouped by role: `/students`, `/advisors`, `/registrars`, `/auth`.

## Key Generation Commands

Generate a separate 32-byte HMAC key for `EMAIL_LOOKUP_KEY`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

The server RSA key pair is generated automatically through `crypto101` on backend startup.

