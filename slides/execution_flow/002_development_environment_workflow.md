### Slide 2: Development Environment Workflow
- **`Procfile.dev`**: This file defines the processes for local development:
    - `web`: Starts the Rails server using `bin/rails server` (managed by `Puma`).
    - `js`: Initiates JavaScript bundling with `yarn build --watch`, which uses `esbuild` to compile `app/javascript` files into `app/assets/builds` and watches for changes.
    - `css`: Initiates CSS compilation with `yarn build:css --watch`, using `sass` to compile `app/assets/stylesheets/application.bootstrap.scss` into `app/assets/builds/application.css` and watches for changes.
- **`bin/dev`**: This script ensures `foreman` is installed and then executes `foreman start -f Procfile.dev`, allowing all defined development processes to run concurrently.