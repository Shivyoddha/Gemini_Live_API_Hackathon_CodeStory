## Local Development & Setup

### Slide 1: Prerequisites and Installation
Getting the project up and running locally is straightforward. The documentation clearly outlines the necessary prerequisites: Ruby (version 3.2.2 or higher) and PostgreSQL. Installation guides are provided for both, along with instructions for installing the Bundler gem. The process also includes detailed steps for setting up the PostgreSQL database, including creating the necessary users and databases for development and testing.

### Slide 2: Automated Setup Script
To further simplify the setup process, a convenient `bin/setup` script is included. This script automates several critical tasks: it installs all required Ruby dependencies using `bundle install`, drops and recreates the development and test databases, applies database migrations, and seeds the database with essential default users. This ensures that a new development environment can be configured with a single command.

### Slide 3: Running the Application
Once the setup is complete, starting the Rails server is as simple as running `rails server` or the more direct `./bin/rails s` command. The application will then be accessible at `http://localhost:3000`. The documentation also includes helpful troubleshooting tips for common local development challenges, such as port conflicts or database connection errors.