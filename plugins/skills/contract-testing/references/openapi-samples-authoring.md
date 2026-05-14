# OpenAPI Samples Authoring — `.apiexamples.yaml` Full Reference

## File Format Spec

```yaml
apiVersion: mocks.microcks.io/v1alpha1
kind: APIExamples
metadata:
  name: "{info.title} - {info.version}"   # MUST match OpenAPI contract verbatim
spec:
  examples:
    {operationId}:                         # Matches operationId in OpenAPI paths
      "{Example Name}":                    # Arbitrary, human-readable label
        request:
          parameters:                      # Path + query params as string values
            {paramName}: "{value}"
          headers:                         # Optional — request header matching
            Accept: "application/json"
          body: |                          # Optional — raw JSON body (POST/PUT/PATCH)
            {
              "field": "value"
            }
        response:
          code: 200                        # HTTP status code as integer
          headers:                         # Response headers returned
            Content-Type: "application/json"
          body: |                          # Response body — JSON or plain text
            {
              "id": "DRV-001",
              "status": "eligible"
            }
```

**Required fields:** `apiVersion`, `kind`, `metadata.name`, `spec.examples`.

**Optional per example:** `request.headers`, `request.body`, `response.headers`.

---

## Multiple Examples per Operation

```yaml
spec:
  examples:
    getEligibilityByDriverId:
      "Eligible driver":
        request:
          parameters:
            driverId: "DRV-001"
        response:
          code: 200
          body: |
            {"driverId": "DRV-001", "eligible": true, "reason": null}

      "Ineligible driver — underage":
        request:
          parameters:
            driverId: "DRV-YOUNG"
        response:
          code: 200
          body: |
            {"driverId": "DRV-YOUNG", "eligible": false, "reason": "UNDERAGE"}

      "Driver not found":
        request:
          parameters:
            driverId: "DRV-UNKNOWN"
        response:
          code: 404
          body: |
            {"code": "DRIVER_NOT_FOUND", "message": "Driver DRV-UNKNOWN does not exist"}
```

---

## Dispatcher-Specific Example Patterns

### JSON_BODY Dispatcher

Routes based on an exact JSON body field value. The dispatcher rule references example names.

**`.apimetadata.yaml`:**
```yaml
spec:
  operations:
    - name: "POST /eligibilities"
      dispatcher: JSON_BODY
      dispatcherRules: |
        exp=$.driverAge cases=UNDERAGE:Underage driver&&YOUNG:Young driver&&ADULT:Adult driver
```

**Matching `.apiexamples.yaml` examples:**
```yaml
spec:
  examples:
    checkEligibility:
      "Underage driver":
        request:
          body: |
            {"driverAge": 16, "vehicleType": "car"}
        response:
          code: 200
          body: |
            {"eligible": false, "reason": "UNDERAGE"}

      "Young driver":
        request:
          body: |
            {"driverAge": 22, "vehicleType": "car"}
        response:
          code: 200
          body: |
            {"eligible": true, "reason": null, "surcharge": 0.25}

      "Adult driver":
        request:
          body: |
            {"driverAge": 35, "vehicleType": "car"}
        response:
          code: 200
          body: |
            {"eligible": true, "reason": null, "surcharge": 0.0}
```

---

### JS Dispatcher

Routes using a JavaScript function. Full request object available.

**Request object properties available in `dispatch(request)`:**
- `request.body` — raw request body string
- `request.method` — HTTP method string
- `request.path` — request path
- `request.params` — map of query params
- `request.headers` — map of headers

**`.apimetadata.yaml`:**
```yaml
spec:
  operations:
    - name: "POST /eligibilities"
      dispatcher: JS
      dispatcherRules: |
        function dispatch(request) {
          var body = JSON.parse(request.body);
          if (body.driverAge < 18) return "Underage driver";
          if (body.driverAge <= 25) return "Young driver";
          return "Adult driver";
        }
```

---

### Groovy Dispatcher

Routes using a Groovy closure. Supports stateful mocks via in-memory maps.

**`.apimetadata.yaml`:**
```yaml
spec:
  operations:
    - name: "POST /eligibilities"
      dispatcher: GROOVY
      dispatcherRules: |
        def body = new groovy.json.JsonSlurper().parseText(request.body)
        if (body.driverAge < 18) return "Underage driver"
        if (body.driverAge <= 25) return "Young driver"
        return "Adult driver"
```

**Stateful Groovy mock (call counter):**
```groovy
// Count calls and return different responses
if (!mockState.containsKey("callCount")) mockState["callCount"] = 0
mockState["callCount"] = mockState["callCount"] + 1
if (mockState["callCount"] == 1) return "First call"
return "Subsequent call"
```

**Delay simulation:**
```groovy
Thread.sleep(200)  // 200ms simulated latency
return "Slow response"
```

---

## Response Body Templating (Mustache)

Use `{{ }}` placeholders in response bodies to echo request values.

```yaml
response:
  body: |
    {
      "driverId": "{{ request.params.driverId }}",
      "checkedAt": "{{ now }}",
      "eligible": true
    }
```

**Available template variables:**
- `{{ request.params.{name} }}` — path or query param value
- `{{ request.body.{field} }}` — JSON body field (dot-notation)
- `{{ now }}` — current ISO 8601 timestamp
- `{{ randomString(n) }}` — random alphanumeric string of length n
- `{{ randomInt(min, max) }}` — random integer in range

---

## Header Matching

```yaml
request:
  headers:
    Authorization: "Bearer valid-token"
    X-Correlation-Id: "test-correlation-001"
response:
  code: 200
  headers:
    Content-Type: "application/json"
    X-Request-Id: "{{ request.headers.X-Correlation-Id }}"
  body: |
    {"status": "ok"}
```

---

## Query Parameter Matching

```yaml
request:
  parameters:
    driverId: "DRV-001"
    includeHistory: "true"
response:
  code: 200
  body: |
    {"driverId": "DRV-001", "eligible": true, "history": [...]}
```

---

## Naming Conventions

| Field | Convention |
|---|---|
| `metadata.name` | `{info.title} - {info.version}` (exact match, case-sensitive) |
| Example names | Sentence case, domain language (e.g., "Eligible driver", "Driver not found") |
| operationId | camelCase, matches OpenAPI operationId exactly |

---

## Validation Rules

- `metadata.name` mismatch between contract and examples → Microcks silently ignores examples.
- Example names referenced in dispatcher rules must match example names in `spec.examples` exactly.
- Response `body` must be valid JSON when `Content-Type: application/json`.
- `code` must be an integer, not a string.
