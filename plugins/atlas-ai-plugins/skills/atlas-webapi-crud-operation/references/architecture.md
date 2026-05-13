# Atlas Clean Architecture — Minimal API Patterns

Reference for the `atlas-webapi-crud-operation` skill. Use these patterns when generating code.

---

## Table of Contents

1. [Project structure](#1-project-structure)
2. [Endpoint registration pattern](#2-endpoint-registration-pattern)
3. [Request and Response DTOs](#3-request-and-response-dtos)
4. [Service interface and implementation](#4-service-interface-and-implementation)
5. [FluentValidation](#5-fluentvalidation)
6. [Domain entity and repository interface](#6-domain-entity-and-repository-interface)
7. [Infrastructure — DB model and repository](#7-infrastructure--db-model-and-repository)
8. [Telemetry tagging](#8-telemetry-tagging)
9. [OpenAPI decoration helpers](#9-openapi-decoration-helpers)
10. [Program.cs DI registrations](#10-programcs-di-registrations)
11. [Error handling](#11-error-handling)
12. [Unit tests](#12-unit-tests)
13. [Component tests](#13-component-tests)
14. [IoC tests](#14-ioc-tests)
15. [Client project](#15-client-project)

---

## 1. Project structure

```
ApiSolution/
├── src/
│   ├── <ApiName>.WebApi/                      ← HTTP endpoints
│   │   ├── Endpoints/
│   │   │   └── <Entity>Endpoints.cs
│   │   ├── Extensions/
│   │   │   └── ServiceCollectionExtensions.cs
│   │   ├── ErrorHandling/
│   │   │   └── StatusCodeMapper.cs
│   │   └── Program.cs
│   │
│   ├── <ApiName>.Application.Contracts/       ← DTOs + service interfaces
│   │   ├── Requests/
│   │   │   ├── <Entity>Request.cs
│   │   │   └── <Entity>CreateRequest.cs
│   │   ├── Responses/
│   │   │   ├── <Entity>Response.cs
│   │   │   └── CreatedResponse.cs
│   │   └── I<Entity>Service.cs
│   │
│   ├── <ApiName>.Application.Impl/            ← Business logic
│   │   ├── <Entity>Service.cs
│   │   ├── Mappers/
│   │   │   └── <Entity>MapperExtensions.cs
│   │   └── Validators/
│   │       └── <Entity>RequestValidator.cs
│   │
│   ├── <ApiName>.Domain/                      ← Entities + repo interfaces
│   │   ├── <Entity>.cs
│   │   ├── I<Entity>Repository.cs
│   │   ├── Enums/
│   │   ├── Exceptions/
│   │   └── Shared/
│   │       └── DataResponse.cs
│   │
│   └── <ApiName>.Infrastructure/              ← Data access
│       ├── <Entity>Repository.cs
│       ├── DbModels/
│       │   ├── <Entity>DbModel.cs
│       │   └── Mappers/
│       │       └── <Entity>DbModelExtensions.cs
│       └── Configuration/
│
├── tests/
│   ├── <ApiName>.Application.UnitTest/        ← Service unit tests
│   │   └── <Entity>ServiceTests.cs
│   └── <ApiName>.ComponentTest/               ← End-to-end integration tests
│       ├── Base/
│       │   └── BaseFixture.cs
│       └── <Entities>/
│           ├── CreateTest.cs
│           ├── GetByIdTest.cs
│           └── ...
│
└── client/
    └── <ApiName>.Client/                      ← Refit client NuGet package
        ├── <ApiName>Client.cs
        └── <Entities>/
            ├── I<Entity>Client.cs
            ├── Requests/
            └── Responses/
```

---

## 2. Endpoint registration pattern

Endpoints are **static classes** with a single extension method on `IEndpointRouteBuilder`. All operations for an entity live in one file. The method returns the builder so calls can be chained in `Program.cs`.

```csharp
// src/<ApiName>.WebApi/Endpoints/ProjectsEndpoints.cs

public static class ProjectsEndpoints
{
    private const string OpenApiTag = "Projects";

    public static IEndpointRouteBuilder RegisterProjectsEndpoints(
        this IEndpointRouteBuilder app,
        IConfiguration configuration)
    {
        // ── List ────────────────────────────────────────────────────
        app.MapGet("/projects",
            async (IProjectsService service, CancellationToken ct) =>
            {
                var result = await service.GetAll(ct);
                return Results.Ok(result);
            })
            .WithOpenApiGet<ProjectResponse[]>(OpenApiTag, configuration, op =>
            {
                op.OperationId = "get-projects";
                op.Summary = "Get Projects";
                return op;
            })
            .WithDisplayName("Get-Projects");

        // ── Get by ID ────────────────────────────────────────────────
        app.MapGet("/projects/{id}",
            async (IProjectsService service, string id,
                   ITelemetryCollector telemetry, CancellationToken ct) =>
            {
                telemetry.AddTag("Id", id);
                var result = await service.Get(id, ct);
                return Results.Ok(result);
            })
            .WithOpenApiGet<ProjectResponse>(OpenApiTag, configuration, op =>
            {
                op.OperationId = "get-project";
                op.Summary = "Get Project";
                return op;
            })
            .WithDisplayName("Get-Project");

        // ── Create ───────────────────────────────────────────────────
        app.MapPost("/projects",
            async (IProjectsService service,
                   ProjectCreateRequest request,
                   ITelemetryCollector telemetry, CancellationToken ct) =>
            {
                telemetry.AddTag("OwnerId", request.OwnerId);
                var response = await service.Create(request, ct);
                telemetry.AddTag("Id", response.Id);
                return Results.Ok(response);
            })
            .WithOpenApiPost<CreatedResponse>(OpenApiTag, configuration, op =>
            {
                op.OperationId = "create-project";
                op.Summary = "Create Project";
                return op;
            })
            .WithDisplayName("Create-Project");

        // ── Update ───────────────────────────────────────────────────
        app.MapPut("/projects/{id}",
            async (IProjectsService service,
                   string id, ProjectRequest request,
                   ITelemetryCollector telemetry, CancellationToken ct) =>
            {
                telemetry.AddTag("Id", id);
                await service.Update(id, request, ct);
                return Results.Ok();
            })
            .WithOpenApiPut(OpenApiTag, configuration, op =>
            {
                op.OperationId = "update-project";
                op.Summary = "Update Project";
                return op;
            })
            .WithDisplayName("Update-Project");

        // ── Delete ───────────────────────────────────────────────────
        app.MapDelete("/projects/{id}",
            async (IProjectsService service, string id,
                   ITelemetryCollector telemetry, CancellationToken ct) =>
            {
                telemetry.AddTag("Id", id);
                await service.Delete(id, ct);
                return Results.Ok();
            })
            .WithOpenApiDelete(OpenApiTag, configuration, op =>
            {
                op.OperationId = "delete-project";
                op.Summary = "Delete Project";
                return op;
            })
            .WithDisplayName("Delete-Project");

        return app;
    }
}
```

**Key rules:**
- Route parameters and key request fields are always added as telemetry tags
- No business logic in endpoints — delegate everything to the service
- Always return `Results.Ok()` for successful operations without a body; `Results.Ok(data)` when returning data
- No try/catch — exceptions bubble up to `ErrorHandlerMiddleware`
- Register in `Program.cs` via chained calls: `app.RegisterProjectsEndpoints(builder.Configuration)`

---

## 3. Request and Response DTOs

DTOs live in `*.Application.Contracts`. Use `record` for immutability.

```csharp
// Requests/ProjectCreateRequest.cs
public record ProjectCreateRequest(
    string Name,
    string? Description,
    string OwnerId,
    DateTime StartDate,
    DateTime? EndDate,
    string[] Tags
);

// Requests/ProjectRequest.cs  (for updates — full shape, validation enforces required fields)
public record ProjectRequest(
    string Name,
    string? Description,
    string OwnerId,
    ProjectStatus Status,
    DateTime StartDate,
    DateTime? EndDate,
    string[] Tags
);

// Responses/ProjectResponse.cs
public record ProjectResponse(
    string Id,
    string Name,
    string? Description,
    string OwnerId,
    ProjectStatus Status,
    DateTime StartDate,
    DateTime? EndDate,
    string[] Tags,
    DateTime CreatedAt,
    DateTime ModifiedAt
);

// Responses/CreatedResponse.cs  (shared, usually already exists)
public record CreatedResponse(string Id);
```

---

## 4. Service interface and implementation

The interface lives in `*.Application.Contracts`; the implementation in `*.Application.Impl`.

```csharp
// Application.Contracts/IProjectsService.cs
public interface IProjectsService
{
    Task<ProjectResponse[]> GetAll(CancellationToken ct);
    Task<ProjectResponse> Get(string id, CancellationToken ct);
    Task<CreatedResponse> Create(ProjectCreateRequest request, CancellationToken ct);
    Task Update(string id, ProjectRequest request, CancellationToken ct);
    Task Delete(string id, CancellationToken ct);
}

// Application.Impl/ProjectsService.cs
public class ProjectsService(
    IProjectsRepository repository,
    IValidator<ProjectCreateRequest> createValidator,
    IValidator<ProjectRequest> updateValidator) : IProjectsService
{
    public async Task<ProjectResponse[]> GetAll(CancellationToken ct)
    {
        var projects = await repository.GetAll(ct);
        return projects.Select(p => p.ToResponse()).ToArray();
    }

    public async Task<ProjectResponse> Get(string id, CancellationToken ct)
    {
        var (_, project) = await repository.Get(id, ct);
        return project.ToResponse();
    }

    public async Task<CreatedResponse> Create(ProjectCreateRequest request, CancellationToken ct)
    {
        await Guard.GuardRequest(createValidator, request);

        var project = new Project
        {
            Id = Guid.NewGuid().ToString(),
            Name = request.Name,
            Description = request.Description,
            OwnerId = request.OwnerId,
            Status = ProjectStatus.Draft,
            StartDate = request.StartDate,
            EndDate = request.EndDate,
            Tags = request.Tags
        };

        await repository.Create(project, ct);
        return new CreatedResponse(project.Id);
    }

    public async Task Update(string id, ProjectRequest request, CancellationToken ct)
    {
        await Guard.GuardRequest(updateValidator, request);

        var (etag, project) = await repository.Get(id, ct);

        project.Name = request.Name;
        project.Description = request.Description;
        project.OwnerId = request.OwnerId;
        project.Status = request.Status;
        project.StartDate = request.StartDate;
        project.EndDate = request.EndDate;
        project.Tags = request.Tags;

        await repository.Update(project, etag, ct);
    }

    public async Task Delete(string id, CancellationToken ct)
    {
        await repository.Delete(id, ct);
    }
}
```

**Key rules:**
- Always call `Guard.GuardRequest(validator, request)` before any business logic on Create/Update
- Use `DataResponse<T>` deconstruction: `var (etag, entity) = await repository.Get(id, ct)`
- Map domain → response via mapper extension methods (see Section 7)
- Inject validators as `IValidator<TRequest>` — registered automatically by FluentValidation DI

---

## 5. FluentValidation

Validators live in `*.Application.Impl/Validators/`. Use `AbstractValidator<T>`.

```csharp
// Validators/ProjectCreateRequestValidator.cs
public class ProjectCreateRequestValidator : AbstractValidator<ProjectCreateRequest>
{
    public ProjectCreateRequestValidator()
    {
        RuleFor(x => x.Name)
            .NotNull()
            .NotEmpty()
            .MaximumLength(200);

        RuleFor(x => x.OwnerId)
            .NotNull()
            .NotEmpty();

        RuleFor(x => x.StartDate)
            .NotEmpty();

        RuleFor(x => x.EndDate)
            .GreaterThan(x => x.StartDate)
            .WithMessage("EndDate must be after StartDate")
            .When(x => x.EndDate.HasValue);

        RuleForEach(x => x.Tags)
            .NotEmpty()
            .MaximumLength(50);
    }
}
```

**Validating external entity identifiers:**

Each external entity ID gets its own **dedicated validator class** (`AbstractValidator<string>`). The main request validator then wires it in via `SetValidator` (for optional fields) or via a `MustAsync` inline method (for conditionally required fields).

**Step 1 — dedicated ID validator:**

```csharp
// Validators/OwnerIdValidator.cs
using System.Net;
using Atlas.Users.Client.Users;
using FluentValidation;
using FluentValidation.Results;
using Refit;

public class OwnerIdValidator : AbstractValidator<string>
{
    private readonly IUsersClient _usersClient;

    public OwnerIdValidator(IUsersClient usersClient)
    {
        _usersClient = usersClient;
        RuleFor(ownerId => ownerId).CustomAsync(OwnerShouldExist);
    }

    private async Task OwnerShouldExist(string ownerId, ValidationContext<string> context, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(ownerId))
        {
            context.AddFailure(new ValidationFailure(nameof(ownerId), "OwnerId is mandatory"));
            return;
        }

        try
        {
            await _usersClient.Exists(ownerId, ct);
        }
        catch (ApiException ex) when (ex.StatusCode == HttpStatusCode.NotFound)
        {
            context.AddFailure(new ValidationFailure(nameof(ownerId), $"OwnerId: {ownerId} not found"));
        }
    }
}
```

**Step 2a — optional field** (only validate when the field is not empty):

```csharp
RuleFor(x => x.OwnerId)
    .SetValidator(new OwnerIdValidator(usersClient)!)
    .When(x => !string.IsNullOrWhiteSpace(x.OwnerId));
```

**Step 2b — conditionally required field** (mandatory under certain conditions, use an inline `MustAsync` that delegates to the dedicated validator):

```csharp
RuleFor(x => x.OwnerId).MustAsync(OwnerIdValidation!);

// ...

private async Task<bool> OwnerIdValidation(
    ProjectCreateRequest request, string ownerId,
    ValidationContext<ProjectCreateRequest> context, CancellationToken ct)
{
    if (string.IsNullOrWhiteSpace(ownerId))
    {
        context.AddFailure(nameof(ProjectCreateRequest.OwnerId),
            $"{nameof(ProjectCreateRequest.OwnerId)} is mandatory");
        return false;
    }

    var validator = new OwnerIdValidator(_usersClient);
    var result = await validator.ValidateAsync(ownerId, ct);
    if (!result.IsValid)
    {
        foreach (var error in result.Errors)
            context.AddFailure(error.PropertyName, error.ErrorMessage);
        return false;
    }

    return true;
}
```

The client is registered in `ServiceCollectionExtensions.cs` alongside other clients:

```csharp
services.AddClientForUsersClient(configuration)
    .AddIUsersClient()
    .BaseBuilder
    .AddAuditMessageHandler();
```

And the client NuGet is added to `*.Application.Impl.csproj`:

```xml
<PackageReference Include="Atlas.Users.Client" Version="x.y.z" />
```

**DI registration (in `ServiceCollectionExtensions.cs` of Application.Impl):**

```csharp
services.AddValidatorsFromAssemblyContaining<ProjectCreateRequestValidator>();
```

**`Guard.GuardRequest` helper** (already in the codebase — do not reimplement):

```csharp
// Throws FluentValidation.ValidationException if validation fails
// The middleware catches it and returns 400 + ValidationProblemDetails
await Guard.GuardRequest(validator, request);
```

---

## 6. Domain entity and repository interface

Entities live in `*.Domain/`. They implement `IAuditable` to get audit fields automatically.

```csharp
// Domain/Project.cs
public class Project : IAuditable
{
    public string Id { get; set; } = null!;
    public string Name { get; set; } = null!;
    public string? Description { get; set; }
    public string OwnerId { get; set; } = null!;
    public ProjectStatus Status { get; set; }
    public DateTime StartDate { get; set; }
    public DateTime? EndDate { get; set; }
    public string[] Tags { get; set; } = [];

    // from IAuditable:
    public DateTime CreatedAt { get; set; }
    public DateTime ModifiedAt { get; set; }
    public string CreatedBy { get; set; } = null!;
    public string ModifiedBy { get; set; } = null!;
}

// Domain/Enums/ProjectStatus.cs
public enum ProjectStatus { Draft, Active, OnHold, Completed, Cancelled }

// Domain/IProjectsRepository.cs
public interface IProjectsRepository
{
    Task<DataResponse<Project>> Get(string id, CancellationToken ct);
    Task<DataResponse<Project?>> TryGet(string id, CancellationToken ct);
    Task<Project[]> GetAll(CancellationToken ct);
    Task Create(Project project, CancellationToken ct);
    Task Update(Project project, string etag, CancellationToken ct);
    Task Delete(string id, CancellationToken ct);
    Task<bool> Exists(string id, CancellationToken ct);
}
```

**`DataResponse<T>` wrapper** (already exists in `Domain/Shared/DataResponse.cs`):

```csharp
public class DataResponse<T>
{
    public string Etag { get; set; } = null!;
    public T Data { get; set; } = default!;
    public void Deconstruct(out string etag, out T data) { etag = Etag; data = Data; }
}
```

---

## 7. Infrastructure — repository

The repository can use the **domain entity directly** (preferred) or a **separate DB model** when the Cosmos serialization needs to differ from the domain shape. Check the existing repositories in the solution to see which pattern is used and follow it.

---

### Option A — domain model used directly (preferred)

The domain entity has `[JsonProperty]` annotations on properties that need a different JSON key (e.g., `"id"`, `"pk"`). No separate DB model or mapper is needed.

```csharp
// Domain/Project.cs  — add JSON annotations directly on the entity
using Newtonsoft.Json;

public class Project : IAuditable
{
    [JsonProperty("pk")]
    internal string PartitionKey { get; set; } = "Projects";   // fixed partition, or omit if using /id

    [JsonProperty("id")]
    public string Id { get; set; } = null!;
    public string Name { get; set; } = null!;
    public string? Description { get; set; }
    public string OwnerId { get; set; } = null!;
    public ProjectStatus Status { get; set; }
    public DateTime StartDate { get; set; }
    public DateTime? EndDate { get; set; }
    public string[] Tags { get; set; } = [];
    public DateTime CreatedAt { get; set; }
    public DateTime ModifiedAt { get; set; }
    public string CreatedBy { get; set; } = null!;
    public string ModifiedBy { get; set; } = null!;
}
```

```csharp
// Infrastructure/ProjectsRepository.cs
public class ProjectsRepository : IProjectsRepository
{
    public const string ContainerName = "Projects";
    private readonly PartitionKey _partitionKey = new("Projects");   // matches the pk value above
    private readonly Container _container;

    public ProjectsRepository(CosmosClient cosmosClient, IOptions<CosmosSettings> options)
    {
        _container = cosmosClient
            .GetDatabase(options.Value.DatabaseName)
            .GetContainer(ContainerName);
    }

    public async Task<Project> Get(string id, CancellationToken ct)
    {
        try
        {
            var result = await _container.ReadItemAsync<Project>(id, _partitionKey, cancellationToken: ct);
            return result.Resource;
        }
        catch (CosmosException ex) when (ex.StatusCode == HttpStatusCode.NotFound)
        {
            throw new EntityNotFoundException($"Project {id} not found");
        }
    }

    public async Task<Project[]> GetAll(CancellationToken ct)
    {
        var query = new QueryDefinition("SELECT * FROM c");
        using var iterator = _container.GetItemQueryIterator<Project>(query);
        var results = new List<Project>();
        while (iterator.HasMoreResults)
        {
            var page = await iterator.ReadNextAsync(ct);
            results.AddRange(page.Resource);
        }
        return results.ToArray();
    }

    public async Task<Project> Create(Project project, CancellationToken ct)
    {
        try
        {
            var result = await _container.CreateItemAsync(project, _partitionKey, cancellationToken: ct);
            return result.Resource;
        }
        catch (CosmosException ex) when (ex.StatusCode == HttpStatusCode.Conflict)
        {
            throw new EntityAlreadyExistsException(project.Id);
        }
    }

    public async Task Update(Project project, CancellationToken ct)
    {
        await _container.UpsertItemAsync(project, _partitionKey, cancellationToken: ct);
    }

    public async Task Delete(string id, CancellationToken ct)
    {
        try
        {
            await _container.DeleteItemAsync<Project>(id, _partitionKey, cancellationToken: ct);
        }
        catch (CosmosException ex) when (ex.StatusCode == HttpStatusCode.NotFound)
        {
            throw new EntityNotFoundException($"Project {id} not found");
        }
    }
}
```

No mapper extension needed — the domain entity is returned directly from the repository to the service.

---

### Option B — separate DB model (when domain shape differs from storage shape)

Use this when you need to isolate the domain from Cosmos serialization concerns (e.g., different field names, computed fields, or nested structures that shouldn't appear in the domain).

```csharp
// Infrastructure/DbModels/ProjectDbModel.cs
public class ProjectDbModel
{
    [JsonPropertyName("id")]    public string Id { get; set; } = null!;
    [JsonPropertyName("name")]  public string Name { get; set; } = null!;
    // ... all fields with explicit JSON names
}

// Infrastructure/DbModels/Mappers/ProjectDbModelExtensions.cs
public static class ProjectDbModelExtensions
{
    public static Project ToDomain(this ProjectDbModel db) => new() { Id = db.Id, Name = db.Name, /* ... */ };
    public static ProjectDbModel ToDbModel(this Project domain) => new() { Id = domain.Id, Name = domain.Name, /* ... */ };
}
```

The repository then uses `ProjectDbModel` in all Cosmos calls and calls `.ToDomain()` / `.ToDbModel()` when crossing the layer boundary.

---

**Application.Impl mapper** (same regardless of which option is used):

```csharp
// Application.Impl/Mappers/ProjectMapperExtensions.cs
public static class ProjectMapperExtensions
{
    public static ProjectResponse ToResponse(this Project project) => new(
        Id: project.Id, Name: project.Name, Description: project.Description,
        OwnerId: project.OwnerId, Status: project.Status,
        StartDate: project.StartDate, EndDate: project.EndDate, Tags: project.Tags,
        CreatedAt: project.CreatedAt, ModifiedAt: project.ModifiedAt
    );
}
```

---

## 8. Telemetry tagging

Add `ITelemetryCollector telemetry` as a parameter to any endpoint that handles a specific resource (not list endpoints). Tag all route parameters and key identifiers.

```csharp
// Single entity endpoint — tag the route param
app.MapGet("/projects/{id}",
    async (IProjectsService service, string id,
           ITelemetryCollector telemetry, CancellationToken ct) =>
    {
        telemetry.AddTag("Id", id);
        var result = await service.Get(id, ct);
        return Results.Ok(result);
    });

// Create endpoint — tag a key request field, then tag the new ID after creation
app.MapPost("/projects",
    async (IProjectsService service, ProjectCreateRequest request,
           ITelemetryCollector telemetry, CancellationToken ct) =>
    {
        telemetry.AddTag("OwnerId", request.OwnerId);
        var response = await service.Create(request, ct);
        telemetry.AddTag("Id", response.Id);
        return Results.Ok(response);
    });
```

---

## 9. OpenAPI decoration helpers

The `Atlas.MinimalApi` NuGet package provides extension methods on `RouteHandlerBuilder`:

```csharp
.WithOpenApiGet<TResponse>(string tag, IConfiguration config, Func<OpenApiOperation, OpenApiOperation> configure)
.WithOpenApiGet<TResponse[]>(...)   // array variant for list endpoints
.WithOpenApiPost<TResponse>(...)
.WithOpenApiPut(...)                // no response body
.WithOpenApiDelete(...)             // no response body
```

Always chain `.WithDisplayName("Verb-Entity")` after the OpenAPI decoration.

---

## 10. Program.cs DI registrations

When adding a new entity, register in `Program.cs` (or `ServiceCollectionExtensions.cs`):

```csharp
builder.Services.AddScoped<IProjectsService, ProjectsService>();
builder.Services.AddScoped<IProjectsRepository, ProjectsRepository>();

app
    .RegisterExistingEndpoints(builder.Configuration)
    .RegisterProjectsEndpoints(builder.Configuration);
```

Validators are auto-registered via `AddValidatorsFromAssemblyContaining<...>` — no per-validator registration needed.

---

## 11. Error handling

Never add try/catch in endpoints or service methods (except repository Cosmos calls).

```csharp
throw new EntityNotFoundException($"Project {id} not found");      // → 404
throw new ValidationException(failures);                            // → 400 (auto, via Guard)
throw new EntityAlreadyExistsException(project.Id);                 // → 409
throw new CosmosDbTooManyRequestsException();                       // → 429
```

### StatusCodeMapper

Every exception that can surface from the new operation must have an entry in `ErrorHandling/StatusCodeMapper.cs`. The class style varies per solution — match whichever is already in use:

**Instance style (implements `IStatusCodeMapper`):**

```csharp
public class StatusCodeMapper : IStatusCodeMapper
{
    public HttpStatusCode Map(Exception exception)
    {
        var statusCode = exception switch
        {
            CosmosDbTooManyRequestsException => HttpStatusCode.TooManyRequests,
            EntityAlreadyExistsException     => HttpStatusCode.Conflict,
            EntityNotFoundException          => HttpStatusCode.NotFound,
            ValidationException              => HttpStatusCode.BadRequest,
            _                                => (HttpStatusCode)0
        };
        return statusCode;
    }
}
```

**Static style:**

```csharp
public static class StatusCodeMapper
{
    public static int Map(Exception exception)
    {
        HttpStatusCode? statusCode = exception switch
        {
            EntityNotFoundException          => HttpStatusCode.NotFound,
            EntityAlreadyExistsException     => HttpStatusCode.Conflict,
            CosmosDbTooManyRequestsException => HttpStatusCode.TooManyRequests,
            ValidationException              => HttpStatusCode.BadRequest,
            _                                => null
        };
        return (int)(statusCode ?? HttpStatusCode.InternalServerError);
    }
}
```

Only add entries for exceptions not already present. Never change entries that already exist.

---

## 12. Unit tests

Unit tests live in `tests/<ApiName>.Application.UnitTest/`. One file per service class.

**Stack:** xUnit · NSubstitute · FluentAssertions

**Test naming convention:** `MethodName_ExpectedResult_WhenScenario`

```csharp
// tests/<ApiName>.Application.UnitTest/ProjectsServiceTests.cs

public class ProjectsServiceTests
{
    private readonly IProjectsRepository _repository;
    private readonly IValidator<ProjectCreateRequest> _createValidator;
    private readonly IValidator<ProjectRequest> _updateValidator;
    private readonly ProjectsService _sut;

    public ProjectsServiceTests()
    {
        _repository = Substitute.For<IProjectsRepository>();
        _createValidator = Substitute.For<IValidator<ProjectCreateRequest>>();
        _updateValidator = Substitute.For<IValidator<ProjectRequest>>();
        _sut = new ProjectsService(_repository, _createValidator, _updateValidator);
    }

    [Fact]
    public async Task Create_ShouldReturnCreatedResponse_WhenRequestIsValid()
    {
        // Arrange
        var request = new ProjectCreateRequest(
            "Atlas Platform", "Core infrastructure", "owner-1",
            DateTime.UtcNow, null, ["infrastructure"]);

        _createValidator
            .ValidateAsync(request, Arg.Any<CancellationToken>())
            .Returns(new ValidationResult());

        // Act
        var response = await _sut.Create(request, CancellationToken.None);

        // Assert
        response.Should().NotBeNull();
        response.Id.Should().NotBeNullOrEmpty();
        await _repository.Received(1).Create(
            Arg.Is<Project>(p => p.Name == request.Name && p.OwnerId == request.OwnerId),
            Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Create_ShouldThrowValidationException_WhenRequestIsInvalid()
    {
        // Arrange
        var request = new ProjectCreateRequest(string.Empty, null, "owner-1",
                                               DateTime.UtcNow, null, []);
        _createValidator
            .ValidateAsync(request, Arg.Any<CancellationToken>())
            .Returns(new ValidationResult([new ValidationFailure(nameof(request.Name), "'Name' must not be empty.")]));

        // Act & Assert
        await _sut.Invoking(s => s.Create(request, CancellationToken.None))
            .Should().ThrowAsync<ValidationException>();
        await _repository.DidNotReceive().Create(Arg.Any<Project>(), Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Get_ShouldReturnProjectResponse_WhenProjectExists()
    {
        // Arrange
        var project = new Project { Id = "proj-1", Name = "Atlas Platform", OwnerId = "owner-1",
                                    Status = ProjectStatus.Active, StartDate = DateTime.UtcNow,
                                    Tags = [], CreatedBy = "user", ModifiedBy = "user" };
        _repository.Get("proj-1", Arg.Any<CancellationToken>())
            .Returns(new DataResponse<Project> { Etag = "etag-1", Data = project });

        // Act
        var response = await _sut.Get("proj-1", CancellationToken.None);

        // Assert
        response.Id.Should().Be("proj-1");
        response.Name.Should().Be("Atlas Platform");
    }

    [Fact]
    public async Task Get_ShouldThrowEntityNotFoundException_WhenProjectDoesNotExist()
    {
        _repository.Get("missing", Arg.Any<CancellationToken>())
            .Returns<DataResponse<Project>>(_ => throw new EntityNotFoundException("Project missing not found"));

        await _sut.Invoking(s => s.Get("missing", CancellationToken.None))
            .Should().ThrowAsync<EntityNotFoundException>();
    }

    [Fact]
    public async Task Update_ShouldCallRepositoryUpdate_WhenRequestIsValid()
    {
        // Arrange
        var project = new Project { Id = "proj-1", Name = "Old Name", OwnerId = "owner-1",
                                    Status = ProjectStatus.Draft, StartDate = DateTime.UtcNow,
                                    Tags = [], CreatedBy = "user", ModifiedBy = "user" };
        var request = new ProjectRequest("New Name", null, "owner-1",
                                         ProjectStatus.Active, DateTime.UtcNow, null, []);
        _updateValidator
            .ValidateAsync(request, Arg.Any<CancellationToken>())
            .Returns(new ValidationResult());
        _repository.Get("proj-1", Arg.Any<CancellationToken>())
            .Returns(new DataResponse<Project> { Etag = "etag-1", Data = project });

        // Act
        await _sut.Update("proj-1", request, CancellationToken.None);

        // Assert
        await _repository.Received(1).Update(
            Arg.Is<Project>(p => p.Name == "New Name" && p.Status == ProjectStatus.Active),
            "etag-1", Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Delete_ShouldCallRepositoryDelete()
    {
        await _sut.Delete("proj-1", CancellationToken.None);

        await _repository.Received(1).Delete("proj-1", Arg.Any<CancellationToken>());
    }
}
```

**NuGet packages for unit test projects:**

```xml
<PackageReference Include="Microsoft.NET.Test.Sdk" />
<PackageReference Include="xunit" />
<PackageReference Include="xunit.runner.visualstudio" />
<PackageReference Include="FluentAssertions" />
<PackageReference Include="NSubstitute" />
<PackageReference Include="NSubstitute.Analyzers.CSharp" />
```

**What to test per operation:**

| Operation | Happy path | Validation failure | Not found |
|-----------|------------|--------------------|-----------|
| Create    | ✓ returns `CreatedResponse`, repo called once | ✓ throws `ValidationException`, repo not called | — |
| GetById   | ✓ returns mapped response | — | ✓ throws `EntityNotFoundException` |
| GetAll    | ✓ returns mapped array | — | — |
| Update    | ✓ repo `Update` called with correct args and etag | ✓ throws `ValidationException`, repo not called | ✓ throws `EntityNotFoundException` |
| Delete    | ✓ repo `Delete` called once | — | ✓ throws `EntityNotFoundException` (if repo propagates it) |

---

## 13. Component tests

Component tests live in `tests/<ApiName>.ComponentTest/`. They spin up the **real API** with `WebApplicationFactory` and a **real Cosmos DB** (via `Atlas.ComponentTesting.CosmosDb`), then call the endpoints through the Refit client. One file per operation, grouped by entity.

**Stack:** xUnit · FluentAssertions · `Atlas.ComponentTesting.CosmosDb`

### BaseFixture

```csharp
// tests/<ApiName>.ComponentTest/Base/BaseFixture.cs

public sealed class BaseFixture : IAsyncLifetime
{
    private readonly ProjectsApiFactory _factory;
    private readonly CosmosTestDb<Program> _cosmosDb;

    public IServiceProvider TestServices { get; private set; } = null!;

    public BaseFixture()
    {
        Environment.SetEnvironmentVariable("APIKEY_DISABLED", "1");
        _factory = new ProjectsApiFactory();
        _cosmosDb = new CosmosTestDb<Program>(_factory, "<DatabaseName>");
    }

    public async Task InitializeAsync()
    {
        await _cosmosDb.InitializeAsync();
        TestServices = BuildTestServiceProvider();
    }

    public async Task DisposeAsync() => await _cosmosDb.DisposeAsync();

    private IServiceProvider BuildTestServiceProvider()
    {
        var services = new ServiceCollection();
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection([
                new KeyValuePair<string, string?>($"{ProjectsApiClient.SectionName}:Url",
                    _factory.Server.BaseAddress.ToString())
            ])
            .Build();

        services.AddClientForProjectsApiClient(configuration)
            .AddIProjectsClient()
            .BaseBuilder
            .ConfigurePrimaryHttpMessageHandler(_ => _factory.HttpMessageHandler)
            .AddAuditMessageHandler();

        return services.BuildServiceProvider();
    }
}

[CollectionDefinition("BaseFixtureCollection")]
public class BaseFixtureCollection : ICollectionFixture<BaseFixture> { }
```

### Test files

```csharp
// tests/<ApiName>.ComponentTest/Projects/CreateTest.cs

[Collection("BaseFixtureCollection")]
public class CreateTest(BaseFixture fixture)
{
    private readonly IProjectsClient _sut =
        fixture.TestServices.GetRequiredService<IProjectsClient>();

    [Fact]
    public async Task Create_ShouldReturnCreatedResponse_WhenRequestIsValid()
    {
        // Arrange
        var request = new ProjectCreateRequest(
            "Atlas Platform", "Core infrastructure", "owner-1",
            DateTime.UtcNow, null, ["infrastructure"]);

        // Act
        var response = await _sut.Create(request);

        // Assert
        response.Should().NotBeNull();
        response.Id.Should().NotBeNullOrWhiteSpace();
    }

    [Fact]
    public async Task Create_ShouldReturnBadRequest_WhenNameIsEmpty()
    {
        // Arrange
        var request = new ProjectCreateRequest(
            string.Empty, null, "owner-1", DateTime.UtcNow, null, []);

        // Act
        var exception = await Assert.ThrowsAsync<ValidationApiException>(
            () => _sut.Create(request));

        // Assert
        exception.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        var problem = await exception.GetContentAsAsync<ValidationProblemDetails>();
        problem!.Errors.Should().ContainKey(nameof(ProjectCreateRequest.Name));
    }
}

// tests/<ApiName>.ComponentTest/Projects/GetByIdTest.cs

[Collection("BaseFixtureCollection")]
public class GetByIdTest(BaseFixture fixture)
{
    private readonly IProjectsClient _sut =
        fixture.TestServices.GetRequiredService<IProjectsClient>();

    [Fact]
    public async Task Get_ShouldReturnProject_WhenProjectExists()
    {
        // Arrange — create a project first so we have a known ID
        var created = await _sut.Create(new ProjectCreateRequest(
            "Test Project", null, "owner-1", DateTime.UtcNow, null, []));

        // Act
        var response = await _sut.Get(created.Id);

        // Assert
        response.Should().NotBeNull();
        response.Id.Should().Be(created.Id);
        response.Name.Should().Be("Test Project");
    }

    [Fact]
    public async Task Get_ShouldReturnNotFound_WhenProjectDoesNotExist()
    {
        var exception = await Assert.ThrowsAsync<ApiException>(
            () => _sut.Get("non-existent-id"));

        exception.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }
}

// tests/<ApiName>.ComponentTest/Projects/DeleteTest.cs

[Collection("BaseFixtureCollection")]
public class DeleteTest(BaseFixture fixture)
{
    private readonly IProjectsClient _sut =
        fixture.TestServices.GetRequiredService<IProjectsClient>();

    [Fact]
    public async Task Delete_ShouldSucceed_WhenProjectExists()
    {
        var created = await _sut.Create(new ProjectCreateRequest(
            "To Delete", null, "owner-1", DateTime.UtcNow, null, []));

        await _sut.Invoking(c => c.Delete(created.Id))
            .Should().NotThrowAsync();
    }

    [Fact]
    public async Task Delete_ShouldReturnNotFound_WhenProjectDoesNotExist()
    {
        var exception = await Assert.ThrowsAsync<ApiException>(
            () => _sut.Delete("non-existent-id"));

        exception.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }
}
```

### NuGet packages for component test projects

```xml
<PackageReference Include="Microsoft.NET.Test.Sdk" />
<PackageReference Include="xunit" />
<PackageReference Include="xunit.runner.visualstudio" />
<PackageReference Include="FluentAssertions" />
<PackageReference Include="Atlas.ComponentTesting.CosmosDb" />
```

---

## 14. IoC tests

IoC tests verify that the DI container can resolve every registered service. They live in `tests/<ApiName>.WebApi.IoCTest/` and reference only the `*.WebApi` project.

**Stack:** xUnit · FluentAssertions

```csharp
// tests/<ApiName>.WebApi.IoCTest/IoCTests.cs

using Microsoft.AspNetCore.Builder;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using <ApiName>.WebApi.Extensions;
using <ApiName>.Application.Contracts;

namespace <ApiName>.WebApi.IoCTest;

public class IoCTests
{
    private readonly IServiceProvider _provider;

    public IoCTests()
    {
        var builder = WebApplication.CreateBuilder();

        builder.Configuration
            .AddJsonFile("appsettings.json", optional: true, reloadOnChange: true)
            .AddJsonFile("appsettings.Development.json", optional: true, reloadOnChange: true)
            .AddEnvironmentVariables()
            .AddInMemoryCollection([
                // Provide dummy values for every required config key so the
                // container builds without a real infrastructure connection.
                new("CosmosDb:ConnectionString", "AccountEndpoint=https://localhost:443/;AccountKey=test;"),
                new($"{ProjectsApiClient.SectionName}:Url", "http://localhost/"),
                // Add one entry per external client URL registered in ServiceCollectionExtensions
                new($"{UsersApiClient.SectionName}:Url", "http://localhost/"),
            ]);

        builder.Services.AddApi(builder.Configuration);

        _provider = builder.Build().Services;
    }

    [Theory]
    [InlineData(typeof(IProjectsService))]
    // Only add [InlineData] for types injected directly into endpoint handlers.
    // Repositories, validators, and external clients are transitive — do not list them.
    public void Should_Resolved_Ok(Type type)
    {
        // Arrange
        var scope = _provider.CreateScope();

        // Act
        var actual = scope.ServiceProvider.GetService(type);

        // Assert
        actual.Should().NotBeNull();
    }
}
```

**NuGet packages:**

```xml
<PackageReference Include="Microsoft.NET.Test.Sdk" />
<PackageReference Include="xunit" />
<PackageReference Include="xunit.runner.visualstudio" />
<PackageReference Include="FluentAssertions" />
```

**Project reference:**

```xml
<ProjectReference Include="..\..\src\<ApiName>.WebApi\<ApiName>.WebApi.csproj" />
```

**Key rules:**
- Only add `[InlineData]` for types **injected directly into endpoint handlers** — the service interface is the only type that qualifies in the standard CRUD pattern
- Repositories, validators, and external clients are resolved transitively; they do not need their own entries
- Still add a dummy `http://localhost/` config entry for each external client URL so the container builds without errors — but do not test them directly
- Use `CreateScope()` to respect scoped lifetimes

---

## 15. Client project

The client is a separate NuGet package that other services consume to call this API. It uses **Refit** for HTTP and `Atlas.Clients` + `Atlas.Clients.Generator` for DI registration code generation.

### Folder structure

```
client/
└── <ApiName>.Client/
    ├── <ApiName>.Client.csproj
    ├── <ApiName>Client.cs            ← marker class with [Client] attribute
    └── Projects/
        ├── IProjectsClient.cs        ← Refit interface
        ├── Requests/
        │   ├── ProjectCreateRequest.cs
        │   └── ProjectRequest.cs
        └── Responses/
            ├── ProjectResponse.cs
            └── CreatedResponse.cs
```

### Marker class

```csharp
// <ApiName>Client.cs
[Client]
public class ProjectsApiClient
{
    public const string SectionName = "ProjectsApiClient";
}
```

The `[Client]` attribute (from `Atlas.Clients`) triggers the source generator (`Atlas.Clients.Generator`) to produce the `AddClientForProjectsApiClient(IConfiguration)` and `AddIProjectsClient()` extension methods automatically.

### Refit interface

```csharp
// Projects/IProjectsClient.cs
public interface IProjectsClient
{
    [Get("/projects")]
    Task<ProjectResponse[]> GetAll(CancellationToken cancellationToken = default);

    [Get("/projects/{id}")]
    Task<ProjectResponse> Get(string id, CancellationToken cancellationToken = default);

    [Post("/projects")]
    Task<CreatedResponse> Create([Body] ProjectCreateRequest request, CancellationToken cancellationToken = default);

    [Put("/projects/{id}")]
    Task Update(string id, [Body] ProjectRequest request, CancellationToken cancellationToken = default);

    [Delete("/projects/{id}")]
    Task Delete(string id, CancellationToken cancellationToken = default);
}
```

### Client DTOs

The client project owns its own request/response records — **not** shared with `Application.Contracts`. This keeps the package independent.

```csharp
// Projects/Requests/ProjectCreateRequest.cs
public record ProjectCreateRequest(
    string Name, string? Description, string OwnerId,
    DateTime StartDate, DateTime? EndDate, string[] Tags);

// Projects/Responses/ProjectResponse.cs
public record ProjectResponse(
    string Id, string Name, string? Description, string OwnerId,
    ProjectStatus Status, DateTime StartDate, DateTime? EndDate,
    string[] Tags, DateTime CreatedAt, DateTime ModifiedAt);

public record CreatedResponse(string Id);
```

### Consumer DI registration

A service that calls this API adds to its `ServiceCollectionExtensions.cs`:

```csharp
services.AddClientForProjectsApiClient(configuration)
    .AddIProjectsClient()
    .BaseBuilder
    .AddAuditMessageHandler();
```

Configuration in `appsettings.json`:

```json
{
  "ProjectsApiClient": {
    "Url": "https://api.example.com"
  }
}
```

### NuGet packages for the client project

```xml
<PackageReference Include="Atlas.Clients" Version="0.8.0" />
<PackageReference Include="Atlas.Clients.Generator" Version="0.5.0" />
```
