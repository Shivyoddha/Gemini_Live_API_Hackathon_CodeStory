# Testing Infrastructure
The Traveller repository includes a comprehensive testing suite to ensure the quality and stability of the application.

*   **Test Framework**: Rails' built-in testing framework, based on `minitest` and `ActiveSupport::TestCase`, is used for unit and integration tests.
*   **System Tests**:
    *   **Configuration**: System tests are configured in `test/application_system_test_case.rb` to use `Capybara`, `Selenium WebDriver`, and `Chrome`. This setup enables robust browser-based testing, simulating real user interactions.
    *   **Examples**: Specific system tests like `test/system/companies_test.rb`, `test/system/feedbacks_test.rb`, `test/system/slots_test.rb`, and `test/system/trippackages_test.rb` verify end-to-end functionality, including creating, reading, updating, and deleting records through the user interface.
*   **Controller Tests**:
    *   **Purpose**: Controller tests are present in `test/controllers/` (e.g., `companies_controller_test.rb`, `feedbacks_controller_test.rb`, `slots_controller_test.rb`, `trippackages_controller_test.rb`, `home_controller_test.rb`). These tests focus on verifying the application logic, actions, and responses of individual controllers, ensuring correct routing, parameter handling, and data manipulation.
    *   **Actions Covered**: Tests typically cover standard CRUD actions (`index`, `new`, `create`, `show`, `edit`, `update`, `destroy`).
*   **Fixtures**: `test/fixtures/*.yml` files provide sample data for tests, ensuring a consistent state for test execution without relying on a mutable development database.
*   **Parallelization**: Tests are configured to run in parallel using `parallelize(workers: :number_of_processors, with: :threads)` in `test_helper.rb`, speeding up test execution on multi-core machines.