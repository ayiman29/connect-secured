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

During registration, the user's normalized email address and name are encrypted before insertion into the `user` table. The database stores these values in `email_encrypted` and `name_encrypted`; plaintext email and name columns are removed by the migration process.

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

The old `ENCRYPTION_KEY` is required only while migrating legacy AES-encrypted rows. After all PII and TOTP values have been converted, it can be removed from the runtime environment. `EMAIL_LOOKUP_KEY` must remain because email lookup continues to use HMAC-SHA256.

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

### Existing Data Migration

For an existing database that still has plaintext `user.email` / `user.name` and email foreign keys:

```bash
npm run migrate:user-encryption
```

The migration script:

1. Adds `user_id`, encrypted columns, and lookup columns.
2. Backfills role tables (`student`, `advisor`, `registrar`) from email foreign keys to `user_id` foreign keys.
3. Encrypts existing user email and name values.
4. Generates HMAC lookup values.
5. Re-hashes any non-bcrypt passwords.
6. Removes plaintext email/name columns and old email foreign keys.

For a clean encrypted schema bootstrap, use [migrations/university5_encrypted_schema.sql](migrations/university5_encrypted_schema.sql).

If the database was created before 2FA was added, apply the TOTP migration once:

```bash
mysql -u <db_user> -p <database_name> < migrations/add_totp_to_user.sql
```

### Encrypted Student-Advisor Chat

Apply the chat migration after the main university schema has been created:

```bash
mysql -u <db_user> -p <database_name> < migrations/chat_schema.sql
```

The migration creates `user_ecc_key`, `chat_session`, and `chat_message`. Chat uses a hybrid design so that ECC protects the session key and AES-GCM protects message content:

#### 1. Participant key pairs

When a user first starts or joins a chat, the backend generates an ECC key pair through the project's `crypto101` bridge. The public coordinates identify the participant's key, while the private scalar is used by the backend to unwrap that participant's session key.

#### 2. Per-conversation session key

When a student and advisor start a new conversation, the backend generates one random curve point and derives a 32-byte AES key from that point. The same AES key is encrypted twice with ECC: once for the student's public key and once for the advisor's public key. The conversation stores both encrypted key packages, so either authorized participant can recover the session key with their own private key.

This means the student can choose any advisor returned by `GET /chat/advisors`, and each student-advisor pair has its own `chat_session` record. The unique student/advisor constraint prevents duplicate sessions.

#### 3. Message confidentiality and integrity

Before a message is stored, the backend recovers the participant's AES session key and encrypts the trimmed message with AES-256-GCM. Every message receives a fresh random 12-byte IV and a GCM authentication tag. The database stores only the ciphertext, IV, and tag in `chat_message`.

```javascript
const iv = crypto.randomBytes(12);
const cipher = crypto.createCipheriv('aes-256-gcm', aesKey, iv);
const ciphertext = Buffer.concat([
	cipher.update(message, 'utf8'),
	cipher.final(),
]);
const authTag = cipher.getAuthTag();
```

During retrieval, the backend unwraps the session key, verifies the GCM authentication tag, and decrypts each message. If the ciphertext, IV, or tag was changed, decryption fails and the modified message is not returned as trusted text.

#### 4. Authorization and participant access

All `/chat` routes require a valid full JWT. The backend also checks that the authenticated student owns the requested student side of the session or that the authenticated advisor owns the advisor side. A user cannot read or send messages to an unrelated session by changing a session ID.

The advisor contact list is limited to the authenticated advisor's existing chat sessions. The student advisor list is restricted to the student role. The frontend displays message text and timestamps only; ECC keys, AES keys, IVs, tags, and ciphertext are never shown to users.

#### 5. Chat storage layout

```text
user_ecc_key
	user_id, public_key_x, public_key_y, private_key

chat_session
	student_id, advisor_id
	student_encrypted_key, advisor_encrypted_key

chat_message
	session_id, sender_role, sender_id
	ciphertext, iv, auth_tag, created_at
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
			 CHAR_LENGTH(private_key) AS private_key_length,
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
	created_at
FROM chat_message
ORDER BY created_at DESC;
```

Do not run `SELECT totp_secret`, `SELECT private_key`, `SELECT ciphertext`, or the wrapped session-key columns when demonstrating the system. Those values are protected backend data, not user-facing output. Use the authenticated API and the crypto services for enrollment, message delivery, authentication-tag verification, and decryption.

## API Endpoints

### Auth

| Method | Endpoint | Params / Body                  |
| ------ | -------- | ------------------------------ |
| POST   | /auth/signup | name, email, password, role |
| POST   | /auth/login  | email, password, role       |
| POST   | /auth/setup-totp | preAuthToken              |
| POST   | /auth/verify-totp | preAuthToken, code       |

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

#### Setup and API

Apply the comment migration after the main university schema has been created:

```bash
mysql -u <db_user> -p <database_name> < migrations/comment_schema.sql
```

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

The server RSA key pair is generated automatically through `crypto101` on backend startup. To convert existing AES-encrypted PII and TOTP values to RSA, run the migration once:

```bash
npm run migrate:rsa-encryption
```

