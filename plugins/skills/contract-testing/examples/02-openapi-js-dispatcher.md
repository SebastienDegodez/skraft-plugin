# Example 02 — POST /eligibilities with JS Dispatcher (Age-Based Routing)

**Pattern:** POST request body contains `driverAge`; JS dispatcher routes to age-specific eligibility response.

---

## OpenAPI Contract (POST operation added)

```yaml
# .skraft/sdlc/design/contracts/eligibility-check-api.yaml (excerpt — add to existing paths)
paths:
  /eligibilities:
    post:
      operationId: checkEligibility
      summary: Run an eligibility check for a driver
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/CheckEligibilityRequest"
      responses:
        "200":
          description: Eligibility check result
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/EligibilityResult"
        "422":
          description: Invalid request
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/ErrorResponse"

components:
  schemas:
    CheckEligibilityRequest:
      type: object
      required: [driverAge, vehicleType]
      properties:
        driverAge:
          type: integer
          minimum: 14
          maximum: 120
          example: 35
        vehicleType:
          type: string
          enum: [CAR, MOTORCYCLE, TRUCK]
          example: CAR
        postalCode:
          type: string
          pattern: "^[0-9]{5}$"
          example: "75001"
    EligibilityResult:
      type: object
      required: [eligible]
      properties:
        eligible:
          type: boolean
        reason:
          type: string
          nullable: true
        surcharge:
          type: number
          format: double
          nullable: true
          description: Additional premium percentage (0.0 = no surcharge)
        requiresAdditionalReview:
          type: boolean
          default: false
```

---

## Microcks Examples

```yaml
# .skraft/sdlc/distill/contracts/eligibility-check-api.apiexamples.yaml
apiVersion: mocks.microcks.io/v1alpha1
kind: APIExamples
metadata:
  name: "Eligibility Check API - 1.0.0"
spec:
  examples:
    checkEligibility:
      "Underage driver":
        # Driver under 18 — immediately ineligible
        request:
          body: |
            {
              "driverAge": 16,
              "vehicleType": "CAR",
              "postalCode": "75001"
            }
        response:
          code: 200
          headers:
            Content-Type: "application/json"
          body: |
            {
              "eligible": false,
              "reason": "UNDERAGE",
              "surcharge": null,
              "requiresAdditionalReview": false
            }

      "Young driver":
        # Driver 18–25 — eligible with surcharge
        request:
          body: |
            {
              "driverAge": 22,
              "vehicleType": "CAR",
              "postalCode": "75001"
            }
        response:
          code: 200
          headers:
            Content-Type: "application/json"
          body: |
            {
              "eligible": true,
              "reason": null,
              "surcharge": 0.25,
              "requiresAdditionalReview": false
            }

      "Adult driver":
        # Driver over 25 — eligible, no surcharge
        request:
          body: |
            {
              "driverAge": 35,
              "vehicleType": "CAR",
              "postalCode": "75001"
            }
        response:
          code: 200
          headers:
            Content-Type: "application/json"
          body: |
            {
              "eligible": true,
              "reason": null,
              "surcharge": 0.0,
              "requiresAdditionalReview": false
            }

      "Invalid request — missing vehicleType":
        # Missing required field — 422
        request:
          body: |
            {
              "driverAge": 35
            }
        response:
          code: 422
          headers:
            Content-Type: "application/json"
          body: |
            {
              "code": "VALIDATION_ERROR",
              "message": "vehicleType is required"
            }
```

---

## Microcks Metadata (JS Dispatcher)

```yaml
# .skraft/sdlc/distill/contracts/eligibility-check-api.apimetadata.yaml
apiVersion: mocks.microcks.io/v1alpha1
kind: APIMetadata
metadata:
  name: "Eligibility Check API - 1.0.0"
spec:
  operations:
    - name: "POST /eligibilities"
      dispatcher: JS
      dispatcherRules: |
        function dispatch(request) {
          // Guard: missing body returns validation error example
          if (!request.body || request.body.trim() === "") {
            return "Invalid request — missing vehicleType";
          }

          var body = JSON.parse(request.body);

          // Guard: missing vehicleType → validation error
          if (!body.vehicleType) {
            return "Invalid request — missing vehicleType";
          }

          // Age-based routing
          if (body.driverAge < 18) {
            return "Underage driver";
          }
          if (body.driverAge <= 25) {
            return "Young driver";
          }
          return "Adult driver";
        }
```

---

## xUnit Test Illustrating the Routing

```csharp
// MonAssurance.IntegrationTests/Tests/EligibilityCheckDispatcherTests.cs

public class EligibilityCheckDispatcherTests : IAsyncLifetime
{
    private MicrocksContainer _microcks = null!;
    private HttpClient _client = null!;

    public async Task InitializeAsync()
    {
        _microcks = await new MicrocksBuilder()
            .WithMainArtifact("contracts/eligibility-check-api.yaml")
            .WithMainArtifact("contracts/eligibility-check-api.apiexamples.yaml")
            .WithMainArtifact("contracts/eligibility-check-api.apimetadata.yaml")
            .BuildAsync();

        var mockUrl = _microcks.GetRestMockUrl("Eligibility Check API", "1.0.0");
        _client = new HttpClient { BaseAddress = new Uri(mockUrl) };
    }

    public async Task DisposeAsync()
    {
        _client.Dispose();
        await _microcks.DisposeAsync();
    }

    [Theory]
    [InlineData(16, false, "UNDERAGE",  null)]
    [InlineData(22, true,  null,        0.25)]
    [InlineData(35, true,  null,        0.0)]
    public async Task CheckEligibility_routes_by_driverAge(
        int driverAge, bool expectedEligible, string? expectedReason, double? expectedSurcharge)
    {
        // Arrange
        var request = new
        {
            driverAge,
            vehicleType = "CAR",
            postalCode = "75001"
        };

        var content = new StringContent(
            JsonSerializer.Serialize(request),
            Encoding.UTF8,
            "application/json");

        // Act
        var response = await _client.PostAsync("/eligibilities", content);

        // Assert — status code
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        // Assert — body
        var body = await response.Content.ReadAsStringAsync();
        var result = JsonSerializer.Deserialize<EligibilityResultDto>(body,
            new JsonSerializerOptions { PropertyNameCaseInsensitive = true });

        Assert.NotNull(result);
        Assert.Equal(expectedEligible, result.Eligible);
        Assert.Equal(expectedReason, result.Reason);
        Assert.Equal(expectedSurcharge, result.Surcharge);
    }

    [Fact]
    public async Task CheckEligibility_returns_422_when_vehicleType_missing()
    {
        var content = new StringContent(
            """{"driverAge": 35}""",
            Encoding.UTF8,
            "application/json");

        var response = await _client.PostAsync("/eligibilities", content);

        Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);
    }
}

// DTO matching EligibilityResult schema
public record EligibilityResultDto(
    bool Eligible,
    string? Reason,
    double? Surcharge,
    bool RequiresAdditionalReview);
```

---

## Design Notes

- **JS dispatcher is preferred over JSON_BODY for POST** because JSON_BODY requires exact value matching; JS supports range comparisons.
- The `dispatch` function's return value must be a string matching an example name **exactly** — including spaces, hyphens, and em-dashes.
- All three age boundary values (16, 22, 35) are tested by the `Theory` to confirm dispatcher correctness.
- The 422 test validates that the mock correctly returns the error example when routing falls to the guard branch.
