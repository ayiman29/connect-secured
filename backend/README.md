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

The current implementation uses **AES-256-GCM**. AES-GCM provides confidentiality and authenticated encryption. A fresh random 12-byte initialization vector (IV) is generated for every value, so encrypting the same value twice produces different ciphertext.

```javascript
const iv = crypto.randomBytes(IV_LENGTH);
const key = getEncryptionKeyByVersion(ENCRYPTION_KEY_VERSION);
const cipher = crypto.createCipheriv('aes-256-gcm', key, iv, {
	authTagLength: 16,
});

const encrypted = Buffer.concat([
	cipher.update(String(plainText), 'utf8'),
	cipher.final(),
]);
const authTag = cipher.getAuthTag();
```

The stored encrypted value contains the key version, IV, authentication tag, and ciphertext:

```text
version:iv:authentication_tag:ciphertext
```

When the value is retrieved, the application selects the key using the stored version, sets the authentication tag, and decrypts the ciphertext. If the ciphertext or tag has been modified, decryption fails instead of returning untrusted plaintext.

```javascript
const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv, {
	authTagLength: 16,
});
decipher.setAuthTag(authTag);

const decrypted = Buffer.concat([
	decipher.update(ciphertext),
	decipher.final(),
]);
```

### Password Protection

Passwords are not encrypted because passwords should not be recoverable. They are hashed with bcrypt, which generates and stores a salt as part of the resulting hash. During login, bcrypt compares the submitted password with the stored hash.

```javascript
const hashedPassword = await bcrypt.hash(password, 10);
const passwordMatches = await bcrypt.compare(password, user.password);
```

### Integrity Protection

AES-GCM generates an authentication tag for each encrypted value. The tag detects unauthorized changes to the IV, ciphertext, or authenticated encryption data. Any failed verification causes decryption to throw an error.

The API also uses **HMAC-SHA256** with a separate secret key to create a deterministic, protected lookup value for email addresses. This allows the application to find a user without storing a plaintext email or using the encrypted email value as a database lookup key.

```javascript
const digest = crypto
	.createHmac('sha256', lookupKey)
	.update(normalizedEmail, 'utf8')
	.digest('hex');

const emailLookup = `${LOOKUP_KEY_VERSION}:${digest}`;
```

The HMAC key is separate from the AES encryption key. A database user who does not have the application secrets cannot create valid lookup values or valid encrypted payloads.

### Key Configuration and Versions

The application loads cryptographic secrets from environment variables rather than storing them in the database:

- `ENCRYPTION_KEY`: 32-byte AES key encoded as 64 hexadecimal characters.
- `EMAIL_LOOKUP_KEY`: separate 32-byte HMAC key encoded as 64 hexadecimal characters.
- `ENCRYPTION_KEY_VERSION`: active encryption key version, default `v1`.
- `EMAIL_LOOKUP_KEY_VERSION`: active lookup key version, default `v1`.
- `ENCRYPTION_KEY_<VERSION>` and `EMAIL_LOOKUP_KEY_<VERSION>`: optional older keys used to decrypt or validate data created under a previous version.
- `JWT_SECRET`: separate secret used to sign authentication tokens.

Key values are validated at application startup:

```javascript
export function validateSecurityConfiguration() {
	parseHexKey(process.env.ENCRYPTION_KEY, 'ENCRYPTION_KEY');
	parseHexKey(process.env.EMAIL_LOOKUP_KEY, 'EMAIL_LOOKUP_KEY');
}
```

Key-version support allows a controlled migration to a new key: configure the new active version while retaining the previous version for reading existing data, then re-encrypt existing records and retire the old key according to the deployment's key-management policy. The current application does not provide a dedicated key vault or automatic key-generation service, so production secrets should be supplied by a secure secret-management system.

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

## API Endpoints

### Auth

| Method | Endpoint | Params / Body                  |
| ------ | -------- | ------------------------------ |
| POST   | /auth/signup | name, email, password, role |
| POST   | /auth/login  | email, password             |

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

Generate a 32-byte AES key for `ENCRYPTION_KEY`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Generate a separate 32-byte HMAC key for `EMAIL_LOOKUP_KEY`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

