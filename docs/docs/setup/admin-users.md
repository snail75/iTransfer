---
id: admin-users
---

# Admin user management

Admins can manage users from `/admin/users`. The actions on this page are restricted to administrator accounts.

## Transfer ownership

Before deleting or disabling a user, an admin can transfer that user's shares to another active user. The transfer keeps existing public links, files, passwords, expiration dates, recipients, and download behavior unchanged. Only the owner of the selected shares changes.

Reverse shares can be transferred together with normal shares. The transfer dialog shows the number of shares, reverse shares, and the total file size before the admin confirms the action.

Disabled users cannot be selected as the target owner.

## Deactivate users

Use deactivation when a user should lose access but their existing shares should stay available.

When a user is deactivated:

- Existing shares and reverse shares remain available.
- Password sign-in, OAuth sign-in, TOTP login completion, refresh tokens, password reset tokens, login tokens, and API tokens are blocked.
- Existing refresh, login, and password reset tokens for that user are removed immediately.
- The user is marked as disabled in the admin user list.

An admin can reactivate the account later from the same page.

The last active admin account cannot be disabled, demoted, or deleted. This prevents administrators from locking themselves out when disabled admin accounts still exist.

## Delete users

Deleting a user permanently removes the user and their owned shares according to the backend cleanup flow. If a user still owns shares or reverse shares, transfer them first when those links should stay available under another employee's account.
