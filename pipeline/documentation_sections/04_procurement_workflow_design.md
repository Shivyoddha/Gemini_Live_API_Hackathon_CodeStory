## Procurement Workflow Design

The system implements a structured, sequential approval process for two types of procurement documents: Document A and Document B. The workflow ensures clear progression, accountability, and notification at each stage.

### Workflow Participants and Roles:

*   **U (Buyer)**: Initiates Document A and Document B, provides initial details, and tracks status. Receives notifications on approvals and rejections.
*   **P, Q, R, S (Approvers)**: Review and approve (or reject) documents in a specific sequence. Each approver adds remarks and dates for their action. Receive notifications for pending approvals.

### Document Status Enum:

Both `DocA` and `DocB` models share a common `status` enumeration to track their progression:

*   `draft`: Initial state (though `DocA` typically moves to `pending_p_approval` immediately upon creation).
*   `pending_p_approval`: Awaiting approval from Approver P.
*   `pending_q_approval`: Awaiting approval from Approver Q.
*   `pending_r_approval`: Awaiting approval from Approver R.
*   `pending_s_approval`: Awaiting approval from Approver S.
*   `approved`: Fully approved by all required participants.
*   `rejected`: Rejected by any approver, stopping the workflow.

### Workflow Steps:

#### 1. Document A Workflow:

1.  **Initiation by U (Buyer)**:
    *   User U logs in and creates a "New Document A."
    *   U fills in `eq_id` (auto-generated as `CSE_X`), `name`, `cost`, `head`, and initial `u_remarks`.
    *   Upon submission, `u_date` is auto-filled, and the document status is set to `pending_p_approval`.
    *   An email notification is sent to Approver P.
2.  **Approval by P**:
    *   Approver P logs in, sees Document A in their "Pending My Approval" dashboard.
    *   P reviews details, adds `p_remarks`, and clicks "Approve."
    *   `p_date` is auto-filled, and the status changes to `pending_q_approval`.
    *   Email notifications are sent to User U (status update) and Approver Q (new document for approval).
3.  **Approval by Q**:
    *   Similar to P, Q reviews, adds `q_remarks`, approves.
    *   `q_date` is auto-filled, status changes to `pending_r_approval`.
    *   Email notifications are sent to User U and Approver R.
4.  **Approval by R**:
    *   Similar to Q, R reviews, adds `r_remarks`, approves.
    *   `r_date` is auto-filled, status changes to `pending_s_approval`.
    *   Email notifications are sent to User U and Approver S.
5.  **Final Approval by S**:
    *   S reviews, adds `s_remarks`, and approves.
    *   `s_date` is auto-filled, and status changes to `approved`.
    *   Email notification is sent to User U (final approval).
    *   **Automation Trigger**: Upon S's approval, `AutoCreateDocBService` is invoked to automatically create Document B.

#### 2. Document B Workflow (Auto-triggered or Manual):

*   **Auto-creation**: After Document A is fully approved by S, a new Document B is automatically generated.
    *   It inherits `eq_id`, `name`, `cost`, and `head` from the approved Document A.
    *   `proceedings` is auto-filled with "Auto-generated after Document A approval."
    *   The `user` (creator) is set to the current `current_user` (who approved `DocA`).
    *   `u_remarks` is set to "Auto-initiated after Document A approval."
    *   The status is set to `draft` and then immediately to `pending_p_approval`.
*   **Manual Creation**: User U can also create a Document B directly from the dashboard, filling in all details manually, including `proceedings`. `eq_id` is auto-generated in this case.
*   **Approval Chain**: Document B follows the exact same sequential approval process as Document A: P → Q → R → S. Each stage captures dates and remarks, and sends email notifications (to U and the next approver).
*   **Final Approval**: Once S approves Document B, its status becomes `approved`, and an email notification is sent to User U.

#### 3. Rejection Flow:

*   Any approver (P, Q, R, or S) can reject a document at their respective stage.
*   When rejected, the `remarks` field for that approver is updated with the rejection reason, and the document's `status` is set to `rejected`.
*   An email notification is immediately sent to the original buyer (User U) with the rejection message, including the approver's remarks. The workflow stops at this point.

### Sequence Diagram: Document A Approval with Auto-creation of Document B

```mermaid
sequenceDiagram
    participant U as Buyer (User U)
    participant P as Approver P
    participant Q as Approver Q
    participant R as Approver R
    participant S as Approver S
    participant RA as Rails App
    participant DB as PostgreSQL DB
    participant Mail as ProcurementMailer
    participant SMTP as Gmail SMTP
    participant AutoService as AutoCreateDocBService

    U->>RA: Access Dashboard (GET /dashboard)
    RA->>U: Render Dashboard
    U->>RA: Create DocA (POST /doc_as/new)
    RA->>DB: Generate next eq_id for DocA
    RA->>RA: Set u_date, status: :pending_p_approval
    RA->>DB: Save DocA record
    RA->>Mail: document_submitted_to_approver(DocA, 'P')
    Mail->>SMTP: Send email to P
    SMTP->>P: New DocA for Approval
    RA->>U: Redirect to DocA show page (Success message)

    P->>RA: Access Dashboard (GET /dashboard)
    RA->>DB: Fetch pending_p_approval DocAs
    RA->>P: Render Dashboard (DocA pending P's approval)
    P->>RA: Approve DocA (POST /doc_as/:id/approve, remarks)
    RA->>DB: Update DocA (p_remarks, p_date, status: :pending_q_approval)
    RA->>Mail: document_approved_status(DocA, U, "Approved by P...")
    Mail->>SMTP: Send email to U
    SMTP->>U: DocA Approved by P
    RA->>Mail: document_submitted_to_approver(DocA, 'Q')
    Mail->>SMTP: Send email to Q
    SMTP->>Q: New DocA for Approval

    Note over Q,R: Repeat Approval Steps for Q & R
    Q->>RA: Approve DocA
    RA->>DB: Update DocA (q_remarks, q_date, status: :pending_r_approval)
    RA->>Mail: Notify U, Notify R
    R->>RA: Approve DocA
    RA->>DB: Update DocA (r_remarks, r_date, status: :pending_s_approval)
    RA->>Mail: Notify U, Notify S

    S->>RA: Access Dashboard (GET /dashboard)
    RA->>DB: Fetch pending_s_approval DocAs
    RA->>S: Render Dashboard (DocA pending S's approval)
    S->>RA: Approve DocA (POST /doc_as/:id/approve, remarks)
    RA->>DB: Update DocA (s_remarks, s_date, status: :approved)
    RA->>Mail: document_approved_status(DocA, U, "Fully Approved - DocA Complete")
    Mail->>SMTP: Send email to U
    SMTP->>U: DocA Fully Approved

    RA->>AutoService: call(DocA, S)
    AutoService->>DB: Check if DocB exists for DocA.eq_id
    AutoService->>DB: Create DocB record (copy data from DocA, set status: :pending_p_approval, u_date, u_remarks)
    AutoService->>Mail: document_submitted_to_approver(DocB, 'P')
    Mail->>SMTP: Send email to P
    SMTP->>P: New DocB for Approval
    RA->>S: Redirect to new_doc_b_path (Success message for DocA approval and DocB creation)

    Note over P,Q,R,S: DocB follows the same sequential approval as DocA
    P->>RA: Approve DocB
    RA->>DB: Update DocB (p_date, p_remarks, status: :pending_q_approval)
    RA->>Mail: Notify U, Notify Q
    Q->>RA: Approve DocB
    RA->>DB: Update DocB (q_date, q_remarks, status: :pending_r_approval)
    RA->>Mail: Notify U, Notify R
    R->>RA: Approve DocB
    RA->>DB: Update DocB (r_date, r_remarks, status: :pending_s_approval)
    RA->>Mail: Notify U, Notify S
    S->>RA: Approve DocB
    RA->>DB: Update DocB (s_date, s_remarks, status: :approved)
    RA->>Mail: document_approved_status(DocB, U, "Fully Approved - DocB Complete")
    Mail->>SMTP: Send email to U
    SMTP->>U: DocB Fully Approved
```