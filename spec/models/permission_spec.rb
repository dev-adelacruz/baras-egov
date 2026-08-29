# frozen_string_literal: true

require 'rails_helper'

RSpec.describe Permission do
  describe '.for' do
    it 'grants an admin full access to every module' do
      admin = build(:user, :admin)

      permissions = described_class.for(admin)

      expect(permissions.keys).to match_array(Permission::MODULES)
      expect(permissions['user_management']).to match_array(%i[read write delete manage])
    end

    it 'gives municipal staff write on their own office and read on the shared registers' do
      staff = build(:user, :staff, office: 'treasury')

      permissions = described_class.for(staff)

      expect(permissions.keys).to match_array(%w[treasury residents])
      expect(permissions['treasury']).to match_array(%i[read write])
      # BRGY-142: a treasurer looks up the same resident the Lupon secretary
      # does. Read is shared; writing the register is not.
      expect(permissions['residents']).to eq(%i[read])
    end

    it 'keeps write access for staff whose own office is a shared register' do
      encoder = build(:user, :staff, office: 'residents')

      permissions = described_class.for(encoder)

      # The shared read must not narrow the desk that owns the register — the
      # RBI encoder would otherwise be unable to maintain it.
      expect(permissions['residents']).to match_array(%i[read write])
    end

    it 'gives a department head manage on their office and read elsewhere, never user_management' do
      head = build(:user, :department_head, office: 'certifications')

      permissions = described_class.for(head)

      expect(permissions['certifications']).to match_array(%i[read write manage])
      expect(permissions['treasury']).to eq(%i[read])
      expect(permissions).not_to have_key('user_management')
    end

    it 'returns no permissions for staff without an office, not even the shared registers' do
      staff = build(:user, :staff, office: nil)

      # An account with no desk is unprovisioned, and the resident register is
      # access-controlled by DILG mandate — the wrong thing to hand to an
      # account nobody has finished setting up.
      expect(described_class.for(staff)).to eq({})
    end
  end

  describe '.permits?' do
    it 'is true when the action is allowed and false otherwise' do
      staff = build(:user, :staff, office: 'certifications')

      expect(described_class.permits?(staff, :certifications, :write)).to be(true)
      expect(described_class.permits?(staff, :certifications, :delete)).to be(false)
      expect(described_class.permits?(staff, :treasury, :read)).to be(false)
      expect(described_class.permits?(staff, :residents, :read)).to be(true)
      expect(described_class.permits?(staff, :residents, :write)).to be(false)
    end
  end
end
