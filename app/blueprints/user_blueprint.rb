# frozen_string_literal: true
class UserBlueprint < Blueprinter::Base
  identifier :id

  fields :email

  # Extended view for the /api/v1/me endpoint: role, scope and the computed
  # permission map the frontend uses for role-aware rendering.
  view :with_permissions do
    fields :role, :office, :barangay

    field :permissions do |user|
      user.permissions
    end

    field :data_scope do |user|
      user.data_scope
    end
  end
end
