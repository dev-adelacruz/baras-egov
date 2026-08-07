# frozen_string_literal: true

class AddActiveToUsers < ActiveRecord::Migration[7.1]
  def change
    add_column :users, :active, :boolean, null: false, default: true
    add_index :users, :active
  end
end
