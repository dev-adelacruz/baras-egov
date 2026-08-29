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

    it 'limits municipal staff to write access on their office module only' do
      staff = build(:user, :municipal_staff, office: 'treasury')

      permissions = described_class.for(staff)

      expect(permissions.keys).to eq(['treasury'])
      expect(permissions['treasury']).to match_array(%i[read write])
    end

    it 'gives a department head manage on their office and read elsewhere, never user_management' do
      head = build(:user, :department_head, office: 'certifications')

      permissions = described_class.for(head)

      expect(permissions['certifications']).to match_array(%i[read write manage])
      expect(permissions['treasury']).to eq(%i[read])
      expect(permissions).not_to have_key('user_management')
    end

    it 'returns no permissions for staff without an office' do
      staff = build(:user, :municipal_staff, office: nil)

      expect(described_class.for(staff)).to eq({})
    end
  end

  describe '.permits?' do
    it 'is true when the action is allowed and false otherwise' do
      staff = build(:user, :municipal_staff, office: 'certifications')

      expect(described_class.permits?(staff, :certifications, :write)).to be(true)
      expect(described_class.permits?(staff, :certifications, :delete)).to be(false)
      expect(described_class.permits?(staff, :treasury, :read)).to be(false)
    end
  end
end
