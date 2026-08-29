# frozen_string_literal: true

class User < ApplicationRecord
  # Include default devise modules. Others available are:
  # :confirmable, :timeoutable, :trackable and :omniauthable
  include Devise::JWT::RevocationStrategies::JTIMatcher

  devise :database_authenticatable, :registerable,
         :recoverable, :rememberable, :validatable, :lockable,
         :jwt_authenticatable, jwt_revocation_strategy: self

  # BRGY-136 merged `barangay_staff` into `municipal_staff` and renamed the pair
  # `staff`. The integers are unchanged so existing rows keep their meaning; 3 is
  # retired and the migration remapped it to 2.
  enum :role, { admin: 0, department_head: 1, staff: 2 }

  validates :email, presence: true
  validates :office, inclusion: { in: Permission::MODULES }, allow_nil: true

  # Administrators who can still sign in. `active` matters as much as `admin`
  # here: a deactivated admin cannot authenticate, so it does not count toward
  # anybody being able to get back in.
  scope :active_admins, -> { where(role: :admin, active: true) }

  # Whether this account is the last administrator who can still sign in.
  #
  # One barangay, one deployment, and realistically one administrator — the
  # barangay secretary, with no IT department behind them. If this account
  # stops being an active admin there is nobody left to undo it, and recovery
  # means `rails barangay:promote_admin` on a console someone has to be found
  # to run (BRGY-127).
  def sole_active_admin?
    return false unless admin? && active?

    self.class.active_admins.where.not(id: id).none?
  end

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

  # Deactivated accounts cannot authenticate (Devise hook).
  def active_for_authentication?
    super && active?
  end

  def inactive_message
    active? ? super : :account_deactivated
  end
end
