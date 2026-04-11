# Desktop Client

Mediapult Transfer can be used by desktop clients with a personal API token.
The token is sent as a bearer token and can create shares, upload chunks, and
complete shares on behalf of the owning user.

## API Tokens

Use the authenticated web session to create and manage tokens:

- `GET /api/auth/apiTokens`
- `POST /api/auth/apiTokens` with `{ "name": "Windows laptop" }`
- `DELETE /api/auth/apiTokens/:id`

The create response contains the plaintext token only once. Store it in the
operating system credential store and use it as:

```http
Authorization: Bearer mtp.<token-id>.<secret>
```

## Upload Contract

Create a share:

```http
POST /api/shares
Authorization: Bearer mtp.<token-id>.<secret>
Content-Type: application/json

{
  "id": "generatedId",
  "name": "optional display name",
  "recipients": [],
  "security": {}
}
```

If `expiration` is omitted, the server uses `share.defaultExpiration`.

Upload each file in chunks:

```http
POST /api/shares/:shareId/files?id=:fileId&name=:fileName&chunkIndex=0&totalChunks=3
Authorization: Bearer mtp.<token-id>.<secret>
Content-Type: application/octet-stream
```

The first chunk may omit `id`; the response returns the generated file id and
the client must reuse it for later chunks of the same file.

Complete the share:

```http
POST /api/shares/:shareId/complete
Authorization: Bearer mtp.<token-id>.<secret>
```

The public share URL is `<appUrl>/s/<shareId>`.
