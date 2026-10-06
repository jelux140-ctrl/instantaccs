# Creed API Reference & Integration Guide

This document defines the backend API surface for **Creed**. It is written for developers building integrations, such as Discord bots or external synchronization scripts.

## Version & Production Base URL

- **Version**: 2026-07-15
- **Production API Origin**: `https://creedv2.com/api`

---

## Authentication

All administrative and staff endpoints require the Creed admin token. 

### Preferred Method (HTTP Headers)
Send the token in the `Authorization` header as a Bearer token:

```http
Authorization: Bearer YOUR_ADMIN_TOKEN
```

### Alternative Method (Query String)
For quick queries or webhook compatibility, endpoints also accept the `token` query parameter:
Use the `Authorization: Bearer ...` header. Tokens in query strings are not accepted.

> [!WARNING]
> Authenticating via query parameter is discouraged in production because URLs with tokens can be logged by reverse proxies and intermediate servers. Use headers where possible.

---

## Orders

### 1. List Orders
Fetch a list of all orders stored in the database.

- **Method**: `GET`
- **Path**: `/get-orders`
- **Authentication**: Admin token required
- **Query Parameters**:
  - `search` (Optional): A case-insensitive partial string to filter orders by `customer_email`.
- **Response Format**:
  ```json
  {
    "orders": [
      {
        "id": "ord_1783746772604_yepvm90e8",
        "sessionId": "cs_live_abc123...",
        "status": "completed",
        "amount": "4.74",
        "currency": "USD",
        "customerEmail": "customer@example.com",
        "discordUsername": "customer_discord",
        "items": [
          {
            "id": "cod-black-ops-7",
            "name": "Call of Duty Black Ops: Warzone",
            "slug": "product-cod-black-ops-7.html",
            "image": "callofdutyproduct.png",
            "price": "4.99",
            "variant": "Day",
            "quantity": 1
          }
        ],
        "createdAt": "2026-07-11T05:12:52+00:00",
        "paidAt": "2026-07-11T05:13:42.517+00:00"
      }
    ],
    "total": 26,
    "search": null
  }
  ```

#### Best Practices for Real-time Discord Sync (Polling)
To monitor new purchases in real-time, have your Discord bot poll `/get-orders` periodically (e.g., every 60 seconds):
1. Keep a persistent variable storing the `createdAt` timestamp of the last processed order (or the last seen Order ID).
2. Fetch the orders list (which is returned ordered by `createdAt` descending).
3. Process any orders that have a `createdAt` timestamp newer than your last checked timestamp.
4. Update your last-seen order cursor.

---

### 2. Update Order Status
Change the status of an existing order. Note that this is a database operation and does not trigger Stripe actions (like charges or refunds).

- **Method**: `PATCH`
- **Path**: `/manage-order`
- **Authentication**: Admin token required
- **Content-Type**: `application/json`
- **Request Body**:
  ```json
  {
    "orderId": "ord_1783746772604_yepvm90e8",
    "status": "completed"
  }
  ```
  - `status` must be one of: `pending`, `completed`, `failed`, `cancelled`, `refunded`
- **Response Format**:
  ```json
  {
    "success": true,
    "order": {
      "id": "ord_1783746772604_yepvm90e8",
      "status": "completed",
      "sessionId": "cs_live_abc123...",
      "customerEmail": "customer@example.com",
      "discordUsername": "customer_discord",
      "items": [...],
      "createdAt": "2026-07-11T05:12:52+00:00",
      "paidAt": "2026-07-11T05:13:42.517+00:00"
    }
  }
  ```

---

### 3. Delete Order
Delete an order permanently from the database.

- **Method**: `DELETE`
- **Path**: `/manage-order`
- **Authentication**: Admin token required
- **Query Parameters**:
  - `orderId`: The unique ID of the order to delete.
- **Response Format**:
  ```json
  {
    "success": true,
    "message": "Order deleted successfully"
  }
  ```

---

## License Keys (Stock Management)

Your bot can use these endpoints to check stock, add keys, or manage licenses.

### 1. List License Keys
List license keys with optional filters and pagination.

- **Method**: `GET`
- **Path**: `/admin-license-keys`
- **Authentication**: Admin token required (Accepts `X-Creed-Staff-Token` header)
- **Query Parameters**:
  - `product_id` (Optional): Filter keys by product slug (e.g. `rainbow-six`).
  - `used` (Optional): Filter by usage status (`true` or `false`).
  - `order_id` (Optional): Filter keys assigned to a specific order ID.
  - `page` (Optional): Page number for pagination (defaults to `1`).
  - `limit` (Optional): Keys per page (defaults to `50`).
- **Response Format**:
  ```json
  {
    "keys": [
      {
        "id": "uuid-string-here",
        "product_id": "rainbow-six",
        "product_name": "Rainbow Six Siege",
        "key_value": "LICENSE-KEY-12345",
        "used": false,
        "order_id": null,
        "expires_at": null,
        "created_at": "2026-07-08T12:00:00.000Z",
        "metadata": {
          "duration": "7 Days"
        }
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 50,
      "total": 12,
      "pages": 1
    }
  }
  ```

---

### 2. Add License Keys
Add one or more license keys for a specific product.

- **Method**: `POST`
- **Path**: `/admin-license-keys`
- **Authentication**: Admin token required
- **Content-Type**: `application/json`
- **Request Body**:
  ```json
  {
    "product_id": "rainbow-six",
    "product_name": "Rainbow Six Siege",
    "duration": "7 Days",
    "duration_days": 7,
    "keys": ["KEY-AAAA-BBBB", "KEY-CCCC-DDDD"]
  }
  ```
- **Response Format (HTTP 201)**:
  ```json
  {
    "success": true,
    "added": 2,
    "keys": [
      {
        "id": "uuid-1",
        "product_id": "rainbow-six",
        "key_value": "KEY-AAAA-BBBB",
        "used": false,
        "metadata": { "duration": "7 Days", "duration_days": 7 },
        "created_at": "2026-07-15T22:45:00.000Z"
      },
      ...
    ]
  }
  ```
  - Returns `409 Conflict` if any of the keys already exist in the database.

---

### 3. Update License Key
Update fields on a specific license key row.

- **Method**: `PATCH`
- **Path**: `/admin-license-keys`
- **Authentication**: Admin token required
- **Content-Type**: `application/json`
- **Request Body**:
  ```json
  {
    "id": "license-key-uuid",
    "product_name": "New Product Name",
    "metadata": { "duration": "30 Days" }
  }
  ```
  - Allowed fields for updates are: `product_id`, `product_name`, `expires_at`, and `metadata`.
- **Response Format**:
  ```json
  {
    "success": true,
    "key": { ... }
  }
  ```

---

### 4. Delete Unused License Key
Remove a key from database inventory.

- **Method**: `DELETE`
- **Path**: `/admin-license-keys`
- **Authentication**: Admin token required
- **Query Parameters**:
  - `id`: The UUID of the key to delete.
- **Response Format**:
  ```json
  {
    "success": true,
    "message": "Key deleted successfully"
  }
  ```
  > [!IMPORTANT]
  > Keys that have already been assigned to an order (`used = true` or having `order_id` present) cannot be deleted.

---

## Announcements (Store Updates)

A Discord bot can use these endpoints to monitor and broadcast site announcements to a specific Discord channel automatically.

### 1. List Announcements
Fetch all announcements, newest first.

- **Method**: `GET`
- **Path**: `/admin-portal-announcements`
- **Authentication**: Admin token required
- **Response Format**:
  ```json
  {
    "ok": true,
    "announcements": [
      {
        "id": "ann-uuid",
        "title": "Warzone Loader Updated!",
        "body": "Our Call of Duty Warzone loader has been updated for the latest game patch.",
        "body_format": "markdown",
        "is_published": true,
        "published_at": "2026-07-15T20:00:00.000Z",
        "created_at": "2026-07-15T20:00:00.000Z"
      }
    ]
  }
  ```

---

### 2. Create Announcement
Post a new announcement.

- **Method**: `POST`
- **Path**: `/admin-portal-announcements`
- **Authentication**: Admin token required
- **Content-Type**: `application/json`
- **Request Body**:
  ```json
  {
    "title": "Maintenance Schedule",
    "body": "The site will undergo brief maintenance at midnight UTC.",
    "body_format": "markdown", // "markdown" or "plain" (defaults to "plain")
    "is_published": true, // Publish immediately (defaults to false)
    "published_at": "2026-07-15T23:00:00.000Z" // Optional custom release date
  }
  ```
- **Response Format (HTTP 201)**:
  ```json
  {
    "ok": true,
    "announcement": { ... }
  }
  ```

---

### 3. Delete Announcement
Delete a published or draft announcement.

- **Method**: `DELETE`
- **Path**: `/admin-portal-announcements`
- **Authentication**: Admin token required
- **Query Parameters**:
  - `id`: The UUID of the announcement to delete.
- **Response Format**:
  ```json
  {
    "ok": true,
    "deleted": "announcement-uuid"
  }
  ```

---

## Support Tickets

If your bot handles support tickets or acts as a ModMail interface, these endpoints allow syncing conversations.

### 1. List Support Tickets
List all customer support tickets in the database.

- **Method**: `GET`
- **Path**: `/admin-portal-tickets`
- **Authentication**: Admin token required
- **Query Parameters**:
  - `status` (Optional): Filter tickets by status (`open`, `closed`, or `claimed`).
- **Response Format**:
  ```json
  {
    "ok": true,
    "tickets": [
      {
        "id": "ticket-uuid",
        "order_id": "ord_1783746772604_yepvm90e8",
        "subject": "Loader keeps crashing on inject",
        "status": "open",
        "created_at": "2026-07-15T12:00:00.000Z",
        "updated_at": "2026-07-15T12:05:00.000Z"
      }
    ]
  }
  ```

---

### 2. Update Ticket Status
Update the status of a support ticket.

- **Method**: `PATCH`
- **Path**: `/admin-portal-tickets`
- **Authentication**: Admin token required
- **Content-Type**: `application/json`
- **Request Body**:
  ```json
  {
    "id": "ticket-uuid",
    "status": "closed" // "open", "closed", or "claimed"
  }
  ```
- **Response Format**:
  ```json
  {
    "ok": true,
    "ticket": { ... }
  }
  ```
  > [!IMPORTANT]
  > Once a ticket has been marked `claimed` (meaning the order has been successfully claimed or resolved fully), it cannot be set back to `open` or reopened by customers.

---

### 3. Get Ticket Messages (Conversation thread)
Fetch the entire message history of a specific ticket.

- **Method**: `GET`
- **Path**: `/portal-messages`
- **Authentication**: Admin token required
- **Query Parameters**:
  - `ticket_id`: The UUID of the ticket.
  - `after` (Optional): ISO timestamp to only retrieve messages posted after this time.
- **Response Format**:
  ```json
  {
    "ok": true,
    "messages": [
      {
        "id": "msg-uuid-1",
        "author_role": "customer",
        "body": "Help, my key says invalid",
        "created_at": "2026-07-15T12:00:00.000Z"
      },
      {
        "id": "msg-uuid-2",
        "author_role": "admin",
        "body": "Please ensure there are no spaces in your key when pasting it.",
        "created_at": "2026-07-15T12:05:00.000Z"
      }
    ],
    "ticket": {
      "id": "ticket-uuid",
      "status": "open"
    }
  }
  ```

---

### 4. Post Message (Send Ticket Reply)
Post a reply to a support ticket thread.

- **Method**: `POST`
- **Path**: `/portal-messages`
- **Authentication**: Admin token required
- **Content-Type**: `application/json`
- **Request Body**:
  ```json
  {
    "ticket_id": "ticket-uuid",
    "body": "Hello! I checked your order and your key is active. Try it now."
  }
  ```
- **Response Format (HTTP 201)**:
  ```json
  {
    "ok": true,
    "message": {
      "id": "msg-uuid",
      "author_role": "admin",
      "body": "Hello! I checked your order and your key is active. Try it now.",
      "created_at": "2026-07-15T12:10:00.000Z"
    }
  }
  ```
  > [!NOTE]
  > When a message is sent with administrative authentication, `author_role` is set to `"admin"` and a real-time notification email is dispatched to the customer's registered email address. Messages cannot be sent to `closed` or `claimed` threads.

---

## Integration Code Examples

### Node.js (fetch)

```javascript
const API_BASE = process.env.CREED_API_BASE || 'https://creedv2.com/api';
const ADMIN_TOKEN = process.env.CREED_ADMIN_TOKEN;

if (!ADMIN_TOKEN) {
  throw new Error('CREED_ADMIN_TOKEN is required');
}

/**
 * Generic fetch wrapper for Creed Admin API
 */
async function creedRequest(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${ADMIN_TOKEN}`,
      'X-Creed-Staff-Token': ADMIN_TOKEN,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || data.message || `HTTP ${response.status}`);
  }
  return data;
}

// 1. Fetch orders
export async function getOrders(searchQuery) {
  const path = searchQuery ? `/get-orders?search=${encodeURIComponent(searchQuery)}` : '/get-orders';
  const data = await creedRequest(path);
  return data.orders;
}

// 2. Add keys to inventory
export async function addLicenseKeys(productId, productName, duration, keysArray) {
  return await creedRequest('/admin-license-keys', {
    method: 'POST',
    body: {
      product_id: productId,
      product_name: productName,
      duration: duration,
      keys: keysArray
    }
  });
}

// 3. Close support ticket
export async function closeTicket(ticketId) {
  return await creedRequest('/admin-portal-tickets', {
    method: 'PATCH',
    body: {
      id: ticketId,
      status: 'closed'
    }
  });
}
```

### Python (requests)

```python
import os
import requests

API_BASE = os.getenv("CREED_API_BASE", "https://creedv2.com/api")
ADMIN_TOKEN = os.environ["CREED_ADMIN_TOKEN"]

HEADERS = {
    "Authorization": f"Bearer {ADMIN_TOKEN}",
    "X-Creed-Staff-Token": ADMIN_TOKEN,
    "Content-Type": "application/json"
}

def creed_request(method, path, **kwargs):
    url = f"{API_BASE}{path}"
    response = requests.request(method, url, headers=HEADERS, timeout=20, **kwargs)
    response.raise_for_status()
    return response.json()

# 1. Fetch Orders
def get_orders(search=None):
    params = {"search": search} if search else None
    data = creed_request("GET", "/get-orders", params=params)
    return data["orders"]

# 2. Update Order Status
def update_order_status(order_id, status):
    payload = {"orderId": order_id, "status": status}
    return creed_request("PATCH", "/manage-order", json=payload)
```

---

## Status Codes & Errors

- **`200 OK`**: Request succeeded. Returns requested data.
- **`201 Created`**: Resource created successfully (used in `POST /admin-license-keys`, `POST /portal-messages`, `POST /admin-portal-announcements`).
- **`204 No Content`**: Request succeeded (typically options preflight).
- **`400 Bad Request`**: Missing required parameters or inputs validation failed.
- **`401 Unauthorized`**: Missing or invalid administrative token.
- **`403 Forbidden`**: Token is valid but resource access is restricted (e.g., trying to modify a claimed ticket).
- **`404 Not Found`**: Endpoint or requested record does not exist.
- **`405 Method Not Allowed`**: The HTTP method is not supported on this endpoint.
- **`409 Conflict`**: Resource conflict (e.g., trying to add duplicate license keys).
- **`500 Internal Server Error`**: Database or server error.

#### Typical Error Payload:
```json
{
  "error": "Unauthorized"
}
```
