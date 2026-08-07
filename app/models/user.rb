# frozen_string_literal: true

class User < ApplicationRecord
  # Include default devise modules. Others available are:
  # :confirmable, :lockable, :timeoutable, :trackable and :omniauthable
  include Devise::JWT::RevocationStrategies::JTIMatcher
  
  devise :database_authenticatable, :registerable,
         :recoverable, :rememberable, :validatable,
         :jwt_authenticatable, jwt_revocation_strategy: self

  enum :role, { admin: 0, department_head: 1, municipal_staff: 2, barangay_staff: 3 }

  validates :email, presence: true
  validates :office, inclusion: { in: Permission::MODULES }, allow_nil: true
  validates :barangay, presence: true, if: :barangay_staff?

  # The { module => [actions] } map this user is authorized for.
  def permissions
    Permission.for(self)
  end

  # Whether this user may perform `action` on `mod` (module key).
  def can?(mod, action)
    Permission.permits?(self, mod, action)
  end

  # Module keys this user has any access to.
  def accessible_modules
    permissions.keys
  end

  # Barangay-staff only ever see their own barangay's records; everyone else is
  # municipality-wide. Domain controllers use this to scope listings.
  def barangay_scoped?
    barangay_staff?
  end

  # The data scope for listings: a barangay filter for barangay staff, or :all.
  def data_scope
    barangay_scoped? ? { barangay: barangay } : :all
  end

  # Deactivated accounts cannot authenticate (Devise hook).
  def active_for_authentication?
    super && active?
  end

  def inactive_message
    active? ? super : :account_deactivated
  end
end
