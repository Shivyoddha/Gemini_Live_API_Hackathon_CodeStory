### Slide 3: Schema Details (`doc_as` and `doc_bs` tables)
- Common fields: `eq_id` (unique for `doc_as`), `name`, `cost`, `head`.
- Approval fields: `u_date`, `u_remarks`, `p_date`, `p_remarks`, `q_date`, `q_remarks`, `r_date`, `r_remarks`, `s_date`, `s_remarks`.
- `status`: An integer representing the document's current state (using Rails enum mapping).
- `user_id`: Foreign key linking to the `users` table.
- `doc_bs` includes a `proceedings` text field.