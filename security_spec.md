# Nexus Messenger Security Specification

## Data Invariants
1. A user can only write to their own profile doc (`/users/{userId}`).
2. A user can only see conversations they are a member of.
3. A user can only send messages to conversations they are a member of.
4. Messages are immutable once sent (except for deleting or marking as read).
5. Only admins of a group conversation can change group metadata or add/remove members.

## The "Dirty Dozen" Payloads (Denial Tests)
1. **Self-Promotion**: User tries to make themselves `isAdmin` in their profile.
2. **Impersonation**: User sends a message with `senderId` belonging to another user.
3. **Unauthorized Read**: User tries to read messages from a conversation they are not a member of.
4. **Group Hijack**: Regular member tries to change `type` or `updatedAt` of a group conversation they don't admin.
5. **Message Forgery**: User tries to update `content` of an existing message.
6. **Time Warp**: User sends a message with `timestamp` in the future or past (not `request.time`).
7. **Junk Injection**: User tries to use a 2MB string as a displayName.
8. **Member Injection**: User tries to add themselves to a private conversation.
9. **Orphaned Message**: User tries to send a message to a conversation ID that doesn't exist.
10. **Identity Poisoning**: User uses an invalid character in their `userId` path.
11. **PII Leak**: Non-admin user tries to fetch the email of another user.
12. **Status Spoofing**: User tries to mark a message as read for someone else.

## Testing Strategy
We will use `@firebase/testing` or standard rules logic to enforce these.
The rules will prioritize `exists()` checks on members subcollections.
