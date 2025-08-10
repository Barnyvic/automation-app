<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Automation App (NestJS, GraphQL, TypeORM, Puppeteer)

### Overview

This service manages users and automates payment card updates on `paramountplus.com` using Puppeteer. It exposes a secured GraphQL API with JWT.

### Project setup

```
npm install
```

### Run

```
npm run start:dev
```

GraphQL endpoint: `http://localhost:3000/graphql`

### API Reference

All operations are available via GraphQL. Copy-paste the following examples into GraphQL Playground or your client of choice.

Authentication: For secured operations, add the HTTP header:

```
{
  "Authorization": "Bearer <ACCESS_TOKEN>"
}
```

#### Auth

- **register(input: RegisterInput): AuthPayload**
  - **Arguments**: `input { email: string, name: string, password: string }`
  - **Returns**: `AuthPayload { accessToken: string, user { id, email, name, createdAt, updatedAt } }`
  - **Example**:
    ```graphql
    mutation Register($input: RegisterInput!) {
      register(input: $input) {
        accessToken
        user {
          id
          email
          name
          createdAt
          updatedAt
        }
      }
    }
    ```
    Variables:
    ```json
    {
      "input": {
        "email": "alice@example.com",
        "name": "Alice",
        "password": "StrongPass123"
      }
    }
    ```
  - **Errors**:
    - Email already in use → `message: "Email already in use"` (409/Conflict)

- **login(input: LoginInput): AuthPayload**
  - **Arguments**: `input { email: string, password: string }`
  - **Returns**: `AuthPayload { accessToken, user { id, email, name, createdAt, updatedAt } }`
  - **Example**:
    ```graphql
    mutation Login($input: LoginInput!) {
      login(input: $input) {
        accessToken
        user {
          id
          email
          name
          createdAt
          updatedAt
        }
      }
    }
    ```
    Variables:
    ```json
    { "input": { "email": "alice@example.com", "password": "StrongPass123" } }
    ```
  - **Errors**:
    - Invalid credentials → `message: "Invalid credentials"` (401/Unauthorized)

#### Users (secured)

- **users: [User!]!**
  - **Returns**: Array of users
  - **Example**:
    ```graphql
    query {
      users {
        id
        email
        name
        createdAt
        updatedAt
      }
    }
    ```

- **user(id: ID!): User!**
  - **Arguments**: `id: string`
  - **Returns**: Single user
  - **Example**:
    ```graphql
    query User($id: ID!) {
      user(id: $id) {
        id
        email
        name
        createdAt
        updatedAt
      }
    }
    ```
    Variables:
    ```json
    { "id": "<USER_ID>" }
    ```
  - **Errors**:
    - Not found → `message: "User not found"` (404/NotFound)

- **createUser(input: CreateUserInput!): User!**
  - **Arguments**: `input { email, name, password }`
  - **Returns**: Created user
  - **Example**:
    ```graphql
    mutation CreateUser($input: CreateUserInput!) {
      createUser(input: $input) {
        id
        email
        name
        createdAt
        updatedAt
      }
    }
    ```
    Variables:
    ```json
    {
      "input": {
        "email": "bob@example.com",
        "name": "Bob",
        "password": "StrongPass123"
      }
    }
    ```
  - **Errors**:
    - Email already in use → `message: "Email already in use"` (409/Conflict)

- **updateUser(input: UpdateUserInput!): User!**
  - **Arguments**: `input { id: ID!, email?: string, name?: string, password?: string }`
  - **Returns**: Updated user
  - **Example**:
    ```graphql
    mutation UpdateUser($input: UpdateUserInput!) {
      updateUser(input: $input) {
        id
        email
        name
        updatedAt
      }
    }
    ```
    Variables:
    ```json
    { "input": { "id": "<USER_ID>", "name": "New Name" } }
    ```
  - **Errors**:
    - Email already in use → `message: "Email already in use"` (409/Conflict)
    - Not found → `message: "User not found"` (404/NotFound)

- **removeUser(id: ID!): Boolean!**
  - **Arguments**: `id: string`
  - **Returns**: `true` if removed
  - **Example**:
    ```graphql
    mutation Remove($id: ID!) {
      removeUser(id: $id)
    }
    ```
    Variables:
    ```json
    { "id": "<USER_ID>" }
    ```

- Optional service methods (not exposed by default resolvers but available in `UsersService`):
  - `resetPassword(id: string, newPassword: string): UserEntity`
  - `changePassword(id: string, currentPassword: string, newPassword: string): UserEntity` (throws 401 if current password is invalid)

#### Automation (secured)

- **updateCardPayment(userId: ID!, email: String!, password: String!, card: CardInput!): Boolean!**
  - **Arguments**:
    - `userId: string` (internal user to associate logs with)
    - `email: string`, `password: string` (Paramount+ credentials)
    - `card: { cardNumber: string, expiryMonth: Int, expiryYear: Int, cvc: string, nameOnCard: string, postalCode?: string }`
  - **Returns**: `true` on success, `false` on failure (errors are logged to `task_logs`)
  - **Example**:
    ```graphql
    mutation UpdateCard(
      $userId: ID!
      $email: String!
      $password: String!
      $card: CardInput!
    ) {
      updateCardPayment(
        userId: $userId
        email: $email
        password: $password
        card: $card
      )
    }
    ```
    Variables:
    ```json
    {
      "userId": "<USER_ID>",
      "email": "paramountuser@example.com",
      "password": "ParamountPass123",
      "card": {
        "cardNumber": "4111111111111111",
        "expiryMonth": 12,
        "expiryYear": 2030,
        "cvc": "123",
        "nameOnCard": "Alice Example",
        "postalCode": "90210"
      }
    }
    ```
  - **Notes / Errors**:
    - On failure, the mutation returns `false` and a `task_logs` record is created with `status = FAILED`, `message`, and metadata (timestamp, step, last URL, etc.).
    - If the server cannot launch Chrome/Puppeteer or encounters fatal errors before handling, a GraphQL error may be returned.

### Typical error responses

GraphQL errors follow the standard shape. Common cases:

```json
{
  "errors": [
    {
      "message": "Invalid credentials",
      "extensions": { "code": "UNAUTHORIZED" }
    }
  ],
  "data": null
}
```

Other messages you may see:

- `"Email already in use"` (Conflict)
- `"User not found"` (NotFound)
- Validation errors from input validation (e.g., password min length, email format)

### Config (.env)

```
PORT=3000
JWT_SECRET=change_me
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=postgres
DB_NAME=automation_app
CHROME_EXECUTABLE_PATH=C:/Program Files/Google/Chrome/Application/chrome.exe
```

### Schema: main operations

- Auth
  - `register(input: RegisterInput): AuthPayload`
  - `login(input: LoginInput): AuthPayload`
- Users (secured)
  - `users: [User!]!`
  - `user(id: ID!): User!`
  - `createUser(input: CreateUserInput!): User!`
  - `updateUser(input: UpdateUserInput!): User!`
  - `removeUser(id: ID!): Boolean!`
- Automation (secured)
  - `updateCardPayment(userId: ID!, email: String!, password: String!, card: CardInput!): Boolean!`

### Puppeteer

- Uses `puppeteer-core`; configure `CHROME_EXECUTABLE_PATH` if Chrome isn’t at default Windows path.
- Exponential backoff retry for flaky UI waits.
- Logs task outcomes to `task_logs` with metadata (timestamps, last4, expiry).

## Deployment

When you're ready to deploy your NestJS application to production, there are some key steps you can take to ensure it runs as efficiently as possible. Check out the [deployment documentation](https://docs.nestjs.com/deployment) for more information.

If you are looking for a cloud-based platform to deploy your NestJS application, check out [Mau](https://mau.nestjs.com), our official platform for deploying NestJS applications on AWS. Mau makes deployment straightforward and fast, requiring just a few simple steps:

```bash
$ npm install -g @nestjs/mau
$ mau deploy
```

With Mau, you can deploy your application in just a few clicks, allowing you to focus on building features rather than managing infrastructure.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).
