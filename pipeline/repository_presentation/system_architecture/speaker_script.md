## System Architecture

### Slide 1: Core Framework and Pattern
The foundation of this procurement portal is Ruby on Rails, specifically version 7.0. We've adopted the robust Model-View-Controller (MVC) architectural pattern, which separates concerns and promotes maintainable code. For data persistence, the system relies on PostgreSQL, a powerful and reliable relational database management system.

### Slide 2: Key Components
The architecture is composed of several key elements. Controllers manage the flow of information, handling user sessions, displaying dashboard data, and processing document creation and updates for both Document A and Document B. Models define the structure of our data, such as users and documents. Furthermore, we employ Service Objects, like the `AutoCreateDocBService`, to encapsulate complex business logic, such as automating the generation of Document B after Document A is fully approved, keeping our controllers clean and focused.