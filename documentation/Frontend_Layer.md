## Frontend Layer

The frontend is built using a combination of traditional Rails view rendering with modern client-side enhancements:

*   **HTML & ERB**: Views are rendered using Embedded Ruby (ERB) templates, dynamically generating HTML content.
*   **SCSS & CSS**: Styles are managed using Sass (SCSS syntax), which integrates Bootstrap for a consistent and responsive UI. Custom styles are defined in `login.css` and `about.css`. Bootstrap Icons provide vector icons.
*   **JavaScript (Hotwire)**:
    *   **Turbo Rails**: Provides fast page navigation and partial page updates, giving the application a Single-Page Application (SPA) feel by intelligently updating only changed parts of the DOM.
    *   **Stimulus Rails**: A lightweight JavaScript framework that adds behavior to HTML by connecting controllers to DOM elements. An example `hello_controller.js` is present.
    *   **Bootstrap JS**: Integrated via `application.js`, providing interactive components like carousels and dropdowns.
*   **Asset Bundling**: `jsbundling-rails` and `cssbundling-rails` use `esbuild` for JavaScript and `sass` for CSS to efficiently bundle and transpile assets.
