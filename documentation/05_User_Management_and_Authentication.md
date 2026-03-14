# User Management & Authentication
User authentication is robustly handled by the `Devise` gem, providing standard functionalities such as registration, login, password recovery, and account updates.

*   **User Model**: The `User` model (`app/models/user.rb`) includes `devise :database_authenticatable, :registerable, :recoverable, :rememberable, :validatable` modules, enabling core authentication features.
*   **Custom Parameters**: The `ApplicationController` customizes Devise's permitted parameters for user sign-up and account updates. Specifically, during sign-up, `name`, `email`, `password`, `homelocation`, and `phoneno` are permitted. For account updates, `name`, `email`, `password`, and `current_password` are allowed.
    ```ruby
    # app/controllers/application_controller.rb
    class ApplicationController < ActionController::Base
      # ...
      before_action :configure_permitted_parameters, if: :devise_controller?

      protected
      def configure_permitted_parameters
        devise_parameter_sanitizer.permit(:sign_up) { |u| u.permit(:name, :email, :password, :homelocation, :phoneno)}
        devise_parameter_sanitizer.permit(:account_update) { |u| u.permit(:name, :email, :password, :current_password)}
      end
    end
    ```
*   **Post-Login Redirection**: After a successful sign-in, users are redirected to the `home_index_path` as defined in `ApplicationController#after_sign_in_path_for`.
*   **Mailer Views**: Dedicated mailer views for Devise flows, such as `confirmation_instructions`, `reset_password_instructions`, `email_changed`, and `password_change`, are present in `app/views/devise/mailer`, ensuring proper email communication for user-related actions.
*   **Routes**: Devise routes are mounted, and the root path (`/`) is configured to redirect to the `devise/sessions#new` for unauthenticated users. A specific route `get '/users/sign_out' => 'devise/sessions#destroy'` is defined for logout.