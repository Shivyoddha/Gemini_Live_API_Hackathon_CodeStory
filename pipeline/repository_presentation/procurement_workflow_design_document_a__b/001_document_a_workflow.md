### Slide 1: Document A Workflow
- Initiated by User U (Buyer).
- Fields include Equipment ID (`eq_id`), Name, Cost, and Head.
- Approval sequence: U → P → Q → R → S.
- Each stage captures processing dates (`u_date`, `p_date`, etc.) and remarks (`u_remarks`, `p_remarks`, etc.).
- Statuses tracked: `draft`, `pending_p_approval`, `pending_q_approval`, `pending_r_approval`, `pending_s_approval`, `approved`, `rejected`.