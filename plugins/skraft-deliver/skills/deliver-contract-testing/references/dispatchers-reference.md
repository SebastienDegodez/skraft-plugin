# Dispatchers Reference

Dispatchers control how Microcks routes incoming requests to the correct named example.

---

## JSON_BODY Dispatcher

**Purpose:** route based on an exact value of a single JSON body field.

**Use when:** request body contains one routing key with discrete values.

### Rule Syntax

```
exp={jsonPath} cases={value1}:{ExampleName1}&&{value2}:{ExampleName2}&&...
```

- `exp` — JSONPath expression to extract the routing key (dot-notation from `$`)
- `cases` — pipe-delimited `value:ExampleName` pairs separated by `&&`
- Values are string-matched after extraction; quote if needed
- No default case — unmatched requests return a 404 from Microcks

### Example — route on `$.driverAge`

```yaml
spec:
  operations:
    - name: "POST /eligibilities"
      dispatcher: JSON_BODY
      dispatcherRules: |
        exp=$.driverAge cases=16:Underage driver&&22:Young driver&&35:Adult driver
```

### Example — route on nested field `$.driver.category`

```yaml
dispatcherRules: |
  exp=$.driver.category cases=STANDARD:Standard driver&&HIGH_RISK:High risk driver
```

### Wildcard (catch-all) with JS fallback

JSON_BODY does not support wildcards. Use JS dispatcher when you need range matching or catch-all behavior.

---

## JS Dispatcher

**Purpose:** route using a JavaScript function with full access to the request object.

**Use when:** routing depends on multiple fields, range checks, header values, or boolean logic.

### Function Signature

```javascript
function dispatch(request) {
  // must return a string matching an example name
  return "Example Name";
}
```

### Request Object Properties

| Property | Type | Description |
|---|---|---|
| `request.body` | `string` | Raw request body — parse with `JSON.parse()` |
| `request.method` | `string` | HTTP method (`"GET"`, `"POST"`, etc.) |
| `request.path` | `string` | Request path (e.g., `"/eligibilities/DRV-001"`) |
| `request.params` | `object` | Map of query/path params: `request.params.driverId` |
| `request.headers` | `object` | Map of request headers (lowercase keys) |

### Example — age range routing

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

### Example — multi-field routing (age + vehicle type)

```yaml
dispatcherRules: |
  function dispatch(request) {
    var body = JSON.parse(request.body);
    if (body.driverAge < 18) return "Underage driver";
    if (body.vehicleType === "MOTORCYCLE" && body.driverAge < 21) {
      return "Young motorcycle rider";
    }
    return "Standard driver";
  }
```

### Example — path param routing

```yaml
dispatcherRules: |
  function dispatch(request) {
    var driverId = request.params.driverId;
    if (driverId === "DRV-UNKNOWN") return "Driver not found";
    if (driverId === "DRV-SUSPENDED") return "Suspended driver";
    return "Eligible driver";
  }
```

### Example — header-based routing

```yaml
dispatcherRules: |
  function dispatch(request) {
    var version = request.headers["x-api-version"];
    if (version === "v2") return "V2 response";
    return "V1 response";
  }
```

---

## GROOVY Dispatcher

**Purpose:** route using a Groovy closure with access to the request and optional in-memory state.

**Use when:** routing requires stateful behavior (counters, scenario sequencing) or delay simulation.

### Function Signature

```groovy
def body = new groovy.json.JsonSlurper().parseText(request.body)
// return a String matching an example name
return "Example Name"
```

### Request Object Properties

Same as JS dispatcher; `request.body`, `request.method`, `request.path`, `request.params`, `request.headers`.

### Example — basic routing

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

### Example — stateful call counter

`mockState` is a `Map<String, Object>` persisted across requests within a Microcks session.

```yaml
dispatcherRules: |
  if (!mockState.containsKey("callCount")) {
    mockState["callCount"] = 0
  }
  mockState["callCount"] = mockState["callCount"] + 1

  if (mockState["callCount"] == 1) return "First eligibility check"
  if (mockState["callCount"] == 2) return "Second eligibility check"
  return "Default eligibility check"
```

### Example — scenario sequencing (idempotency test)

```groovy
def driverId = request.params?.driverId ?: "UNKNOWN"
def key = "seen-${driverId}"

if (!mockState.containsKey(key)) {
  mockState[key] = 0
}
mockState[key] = mockState[key] + 1

if (mockState[key] > 1) return "Already checked driver"
return "First check driver"
```

### Example — simulated latency

```groovy
Thread.sleep(300)  // 300ms simulated latency
return "Eligible driver"
```

**Warning:** `Thread.sleep` blocks the Microcks request thread. Use only in development/local tests, never in CI.

---

## Dispatcher Selection Guide

| Scenario | Dispatcher |
|---|---|
| Route on exact body field value | `JSON_BODY` |
| Route on range or boolean logic | `JS` |
| Route on path/query params | `JS` |
| Route on request headers | `JS` |
| Multi-field routing | `JS` |
| Stateful mock (counters, sequences) | `GROOVY` |
| Simulated latency | `GROOVY` |
| No routing needed (single example) | No dispatcher needed — omit `dispatcher` field |

---

## Debugging Dispatchers

**Dispatcher does not route:** verify example names in `dispatcherRules` match example names in `.apiexamples.yaml` exactly (case-sensitive, spaces preserved).

**JS syntax error:** Microcks logs the error and returns 404. Check Microcks container logs with:
```
docker logs {microcks-container-id}
```

**GROOVY `mockState` not persisting:** state is per-container session. Restarting the container resets state. Do not rely on state order in parallel test runs.
