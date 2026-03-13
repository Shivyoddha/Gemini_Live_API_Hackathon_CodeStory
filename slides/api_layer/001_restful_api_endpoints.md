### Slide 1: RESTful API Endpoints
- **Resourceful Routing**: `config/routes.rb` defines RESTful routes for several resources using `resources`:
    - `/feedbacks`
    - `/slots`
    - `/companies`
    - `/trippackages`
- **Standard Actions**: Each `resources` declaration automatically generates routes for standard CRUD operations: `index`, `show`, `new`, `create`, `edit`, `update`, and `destroy`.
- **JSON Support**: The inclusion of `jbuilder` gem and corresponding `.json.jbuilder` view files (`app/views/{resource_name}/*.json.jbuilder`) indicates that these resources also expose JSON endpoints for API consumption.