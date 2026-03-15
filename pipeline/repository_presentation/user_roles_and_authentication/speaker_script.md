## User Roles and Authentication

### Slide 1: Defined User Roles
Our system is designed with distinct user roles to manage access and responsibilities effectively. We have the **Buyer**, identified as user 'U', who is responsible for initiating procurement requests. Then, we have the **Approvers**, a group of users labeled P, Q, R, and S, who form the sequential approval chain. Finally, an **Administrator** role is included for managing users and overall system settings.

### Slide 2: Authentication and Security
User authentication is handled securely through session management, ensuring that users remain logged in for the duration of their activity. For password security, we employ the robust **bcrypt** gem, which provides strong hashing to protect user credentials. To facilitate immediate testing and demonstration, specific test credentials for each defined role are readily available within the system's documentation.