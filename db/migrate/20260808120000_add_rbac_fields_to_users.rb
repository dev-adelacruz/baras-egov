# frozen_string_literal: true

class AddRbacFieldsToUsers < ActiveRecord::Migration[7.1]
  def change
    # role: 0 admin, 1 department_head, 2 municipal_staff, 3 barangay_staff
    add_column :users, :role, :integer, null: false, default: 2
    # office: the primary module the user works in (e.g. "civil_registry").
    # nil for admins, who span every module.
    add_column :users, :office, :string
    # barangay: set for barangay-scoped users; nil for municipality-wide users.
    add_column :users, :barangay, :string

    add_index :users, :role
    add_index :users, :barangay
  end
end
