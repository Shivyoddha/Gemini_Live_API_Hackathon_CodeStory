# Frontend Technologies
The frontend of the Traveller application is built for a responsive and dynamic user experience, leveraging a modern stack.

*   **Hotwire**:
    *   **Turbo Rails (`@hotwired/turbo-rails`)**: Enables fast, SPA-like page navigation by intercepting link clicks and form submissions, and updating only parts of the page without full reloads. This is integrated via `import "@hotwired/turbo-rails"` in `app/assets/javascript/application.js`.
    *   **Stimulus (`@hotwired/stimulus`)**: Provides a modest JavaScript framework for adding behavior to HTML. It connects JavaScript objects (controllers) to elements in the HTML. The core setup is in `app/assets/javascript/controllers/application.js` and `app/assets/javascript/controllers/index.js`, with an example `hello_controller.js`.
*   **Styling & UI Framework**:
    *   **Bootstrap (`bootstrap`)**: A popular CSS framework for developing responsive, mobile-first projects on the web. It's imported and utilized through `app/assets/stylesheets/application.bootstrap.scss`, which imports `bootstrap/scss/bootstrap`.
    *   **Bootstrap Icons (`bootstrap-icons`)**: An open-source icon library from Bootstrap, integrated via `@import 'bootstrap-icons/font/bootstrap-icons';` in `application.bootstrap.scss` and its path added to asset load path in `config/initializers/assets.rb`.
    *   **Sass (`sass`, `sassc-rails`)**: Used for CSS pre-processing, allowing for more organized and dynamic stylesheets. `.scss` files are compiled into CSS.
    *   **Custom CSS**: Specific stylesheets like `about.css` and `login.css` (e.g., `app/assets/stylesheets/about.css`, `app/assets/stylesheets/login.css`) are used for custom styling of particular pages, demonstrating tailored design elements beyond the standard Bootstrap. These are linked via `//= link about.css` and `//= link login.css` in `app/assets/config/manifest.js`.
*   **JavaScript Bundling**:
    *   **ESBuild (`esbuild`)**: A fast JavaScript bundler configured in `package.json` under the `scripts.build` command. It bundles `app/javascript/*.*` files into `app/assets/builds`, making them available via the asset pipeline.
*   **CSS Compilation**:
    *   **Sass (`sass`)**: Also used directly for compiling Sass files, as configured in `package.json` under the `scripts.build:css` command. It compiles `app/assets/stylesheets/application.bootstrap.scss` to `app/assets/builds/application.css`.