# Example 01 — OpenAPI GET with JSON_BODY Dispatcher

**Pattern:** GET /eligibilities/{driverId} — 200 and 404 responses routed by driverId path param.

**Files produced:**
1. `eligibility-check-api.yaml` — OpenAPI contract (DESIGN)
2. `eligibility-check-api.apiexamples.yaml` — Microcks examples (DISTILL)
3. `eligibility-check-api.apimetadata.yaml` — dispatcher config (DISTILL)

---

## 1. OpenAPI Contract

```yaml
# .skraft/sdlc/design/contracts/eligibility-check-api.yaml
openapi: 3.1.0
info:
  title: Eligibility Check API
  version: 1.0.0
  description: Evaluates whether a driver is eligible for a MonAssurance insurance policy
paths:
  /eligibilities/{driverId}:
    get:
      operationId: getEligibilityByDriverId
      summary: Get eligibility result for a driver
      parameters:
        - name: driverId
          in: path
          required: true
          schema:
            type: string
          example: DRV-001
      responses:
        "200":
          description: Eligibility result returned
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/EligibilityResult"
        "404":
          description: Driver not found
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/ErrorResponse"
components:
  schemas:
    EligibilityResult:
      type: object
      required: [driverId, eligible]
      properties:
        driverId:
          type: string
          example: DRV-001
        eligible:
          type: boolean
        reason:
          type: string
          nullable: true
          enum: [UNDERAGE, SUSPENDED_LICENSE, HIGH_RISK_ZONE, null]
        surcharge:
          type: number
          format: double
          nullable: true
    ErrorResponse:
      type: object
      required: [code, message]
      properties:
        code:
          type: string
          example: DRIVER_NOT_FOUND
        message:
          type: string
          example: Driver DRV-UNKNOWN does not exist
```

---

## 2. Microcks Examples

```yaml
# .skraft/sdlc/distill/contracts/eligibility-check-api.apiexamples.yaml
apiVersion: mocks.microcks.io/v1alpha1
kind: APIExamples
metadata:
  # Must match info.title + info.version from the OpenAPI contract exactly
  name: "Eligibility Check API - 1.0.0"
spec:
  examples:
    getEligibilityByDriverId:
      "Eligible driver":
        # Standard adult driver — no surcharge
        request:
          parameters:
            driverId: "DRV-001"
        response:
          code: 200
          headers:
            Content-Type: "application/json"
          body: |
            {
              "driverId": "DRV-001",
              "eligible": true,
              "reason": null,
              "surcharge": 0.0
            }

      "Ineligible driver — suspended license":
        # Driver with suspended license — eligible=false, reason populated
        request:
          parameters:
            driverId: "DRV-SUSPENDED"
        response:
          code: 200
          headers:
            Content-Type: "application/json"
          body: |
            {
              "driverId": "DRV-SUSPENDED",
              "eligible": false,
              "reason": "SUSPENDED_LICENSE",
              "surcharge": null
            }

      "Driver not found":
        # Unknown driverId — 404 with error body
        request:
          parameters:
            driverId: "DRV-UNKNOWN"
        response:
          code: 404
          headers:
            Content-Type: "application/json"
          body: |
            {
              "code": "DRIVER_NOT_FOUND",
              "message": "Driver DRV-UNKNOWN does not exist"
            }
```

---

## 3. Microcks Metadata (JSON_BODY Dispatcher)

```yaml
# .skraft/sdlc/distill/contracts/eligibility-check-api.apimetadata.yaml
apiVersion: mocks.microcks.io/v1alpha1
kind: APIMetadata
metadata:
  name: "Eligibility Check API - 1.0.0"
spec:
  operations:
    - name: "GET /eligibilities/{driverId}"
      # Route on the driverId path parameter value
      dispatcher: JSON_BODY
      dispatcherRules: |
        exp=$.driverId cases=DRV-001:Eligible driver&&DRV-SUSPENDED:Ineligible driver — suspended license&&DRV-UNKNOWN:Driver not found
```

> **Note on GET + JSON_BODY:** JSON_BODY normally applies to body fields. For path param routing in GET
> requests, use the JS dispatcher (see Example 02) to access `request.params.driverId`. The JSON_BODY
> approach above works when Microcks maps path params into the "body" for routing — verify with your
> Microcks version. If routing fails, switch to JS as shown below.

**Preferred alternative for GET path param routing (JS dispatcher):**

```yaml
spec:
  operations:
    - name: "GET /eligibilities/{driverId}"
      dispatcher: JS
      dispatcherRules: |
        function dispatch(request) {
          var driverId = request.params.driverId;
          if (driverId === "DRV-001") return "Eligible driver";
          if (driverId === "DRV-SUSPENDED") return "Ineligible driver — suspended license";
          return "Driver not found";
        }
```

---

## Contract Testing Pattern

These three files together enable:

1. **Consumer test:** point `HttpClient.BaseAddress` at `GetRestMockUrl("Eligibility Check API", "1.0.0")`. The mock returns correct JSON for each driverId.
2. **Provider verification:** `await _microcks.VerifyAsync("Eligibility Check API", "1.0.0")` drives all three examples against the real service and asserts responses match.

**Key invariant:** `metadata.name` in both DISTILL files must equal `"Eligibility Check API - 1.0.0"` — any mismatch silently breaks example loading.
