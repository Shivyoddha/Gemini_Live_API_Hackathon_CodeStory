# Travel Package & Booking Management
The application provides comprehensive management for travel packages and user bookings, referred to as 'Slots'.

## Travel Packages
*   **Model**: `Trippackage` (`app/models/trippackage.rb`)
    *   **Attributes**: `package_name`, `destination`, `departure`, `arrival`, `budget`, `description`, `travelfrom`, `noofbookings`, `packcountry`, `company_id`.
    *   **Associations**: `has_many :slots`, `belongs_to :company`.
*   **Controller**: `TrippackagesController` (`app/controllers/trippackages_controller.rb`) handles standard CRUD operations for travel packages.
    *   `index`: Lists all available travel packages.
    *   `show`: Displays details of a specific package.
    *   `new`/`create`: Allows creation of new travel packages.
    *   `edit`/`update`: Facilitates modification of existing packages.
    *   `destroy`: Enables deletion of packages.
    *   `trippackage_params`: Permits `package_name`, `destination`, `departure`, `arrival`, `budget`, `description` for mass assignment.
*   **Views**: Packages are displayed on the `home/index.html.erb` page, where users can browse and select packages.

## Booking Slots
*   **Model**: `Slot` (`app/models/slot.rb`)
    *   **Attributes**: `bookingtime`, `user_id`, `trippackage_id`.
    *   **Associations**: `belongs_to :user`, `belongs_to :trippackage`.
*   **Controller**: `SlotsController` (`app/controllers/slots_controller.rb`) manages booking operations.
    *   `index`: Lists all bookings.
    *   `show`: Displays details of a specific booking.
    *   `new`/`create`: Allows a user to create a new booking for a travel package. The `new` action pre-populates user and package information, and stores `current_trippackage_id` in session. The `create` action associates the slot with `current_user` and `@current_trippackage`.
    *   `edit`/`update`: Facilitates modification of existing bookings.
    *   `destroy`: Enables deletion of bookings.
    *   `slot_params`: Permits `bookingtime`, `user_id`, `user_name`, `trippackage_id`.
*   **User Booking Flow**: Users navigate to `home/index`, view available packages, and click "Book Package". This links to `new_slot_path(user_id:current_user.id, id:package.id)`. The booking form in `app/views/slots/new.html.erb` pre-fills user and package details for confirmation. Confirmed bookings redirect to `home_index_path`. User's booked slots can be viewed at `home_myslots_path(id:current_user.id)`.