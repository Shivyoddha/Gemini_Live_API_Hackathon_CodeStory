### Slide 2: Key Libraries and Gems
- **Authentication**: `Devise` (version `4.9.2`) is used for robust user authentication, including features like database authentication, registration, password recovery, and session management.
- **Admin Interface**: `rails_admin` (version `3.1.2`) provides a powerful and customizable administrative backend, mounted at `/admin` as per `config/routes.rb` and configured in `config/initializers/rails_admin.rb`.
- **Frontend Enhancements**: `turbo-rails` and `stimulus-rails` are integrated to provide Hotwire-driven dynamic user interfaces, accelerating page navigation and client-side interactivity.
- **Asset Management**: `jsbundling-rails` with `esbuild` and `cssbundling-rails` with `sassc-rails` manage JavaScript and CSS assets, respectively.
- **JSON API Builder**: `jbuilder` is included for easily building JSON APIs.
- **Testing**: `Capybara`, `selenium-webdriver`, and `webdrivers` are used for system testing in the test environment, enabling browser-level automation for feature validation.