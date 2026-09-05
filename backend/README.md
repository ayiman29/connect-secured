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

## Security: Encryption At Rest

This API encrypts user PII in the `user` table before saving to MySQL and decrypts it before sending API responses.

- AES-256-GCM is used for encrypted fields (`email_encrypted`, `name_encrypted`)
- Random 12-byte IV is generated per encryption call
- GCM auth tag is stored with ciphertext for integrity/authentication
- Passwords are not encrypted/decrypted and remain bcrypt hashes
- Email search uses HMAC-SHA256 lookup (`email_lookup`) with a separate key
- JWT signing key and encryption/HMAC keys are separate secrets

Required environment variables:

- `JWT_SECRET`
- `ENCRYPTION_KEY` (64 hex chars, 32 bytes)
- `EMAIL_LOOKUP_KEY` (64 hex chars, 32 bytes)

Optional key-version variables for rotation:

- `ENCRYPTION_KEY_VERSION` (default `v1`)
- `EMAIL_LOOKUP_KEY_VERSION` (default `v1`)
- `ENCRYPTION_KEY_<VERSION>` and `EMAIL_LOOKUP_KEY_<VERSION>` for decrypting legacy data

### Existing Data Migration

For an existing database that still has plaintext `user.email` / `user.name` and email foreign keys:

```bash
npm run migrate:user-encryption
```

The migration script:

1. Adds `user_id`, encrypted columns, and lookup columns.
2. Backfills role tables (`student`, `advisor`, `registrar`) from email FK to `user_id` FK.
3. Encrypts existing user email/name values.
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

