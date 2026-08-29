# frozen_string_literal: true
class UserBlueprint < Blueprinter::Base
  identifier :id

  fields :email

  # Extended view for the /api/v1/me endpoint: role, desk and the computed
  # permission map the frontend uses for role-aware rendering.
  #
  # BRGY-136 dropped `data_scope`. It answered "which barangay's records may
  # this account see", and one deployment holds one barangay's records.
  view :with_permissions do
    fields :role, :office

    field :permissions do |user|
      user.permissions
    end
  end

  # View for the admin account-management API: identity, role, desk and status.
  view :admin do
    fields :role, :office, :active
  end
end
