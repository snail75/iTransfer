# Mediapult Transfer

Mediapult Transfer is a self-hosted file sharing platform and an alternative for WeTransfer.

This project is a rebranded fork derived from the BSD-2-Clause licensed upstream project. It is not affiliated with, endorsed by, or presented as an official product of the upstream maintainers.

## Features

- Share files using a link
- Unlimited file size, restricted only by available storage and configuration
- Set expiration dates for shares
- Protect shares with visitor limits and passwords
- Send links to email recipients
- Create reverse shares
- Use OIDC and LDAP authentication
- Scan uploads with ClamAV
- Store files locally or in S3-compatible storage

## Docker

Build a local image:

```bash
docker build -t mediapult-transfer:latest .
```

Run with Docker Compose:

```bash
docker compose up -d
```

The web app listens on `http://localhost:3000` by default.

## Development

Prerequisites:

- Node.js 22 or newer
- npm

Install dependencies:

```bash
cd backend
npm install

cd ../frontend
npm install
```

Run the backend:

```bash
cd backend
npm run dev
```

Run the frontend in another terminal:

```bash
cd frontend
npm run dev
```

In development, the frontend proxies `/api` requests to `http://localhost:8080`.

## License

This project is distributed under the BSD-2-Clause license. Keep the original copyright and license notice when redistributing source or binary builds.

See [LICENSE](LICENSE) and [NOTICE](NOTICE).
