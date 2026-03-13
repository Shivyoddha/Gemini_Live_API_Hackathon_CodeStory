### Slide 2: Administrative and Custom Routes
- **Admin Panel**: `RailsAdmin` is mounted at `/admin` (`mount RailsAdmin::Engine => '/admin', as: 'rails_admin'`), providing a comprehensive interface for managing all database resources.
- **Devise Routes**: `devise_for :users` generates routes for user authentication, including sign-up, sign-in, sign-out, password reset, and account editing.
- **Custom Application Routes**: Several custom GET routes are defined for specific user interface pages:
    - `get 'home/index'`
    - `get 'home/about'`
    - `get 'mainportal/admindashboard'`
    - `get 'mainportal/adminpackage'`
    - `get 'home/myslots'`
- **Root Path**: The application's root path (`/`) is configured to point to the Devise sign-in page (`root 'devise/sessions#new'`). A custom sign-out path is also defined (`get '/users/sign_out' => 'devise/sessions#destroy'`).