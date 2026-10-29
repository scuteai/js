# The server side of the settings suite: a Rails runner that stays up for the
# whole run and answers one JSON line per request. Only the operations below
# can be called, and each one only touches the suite's own workspace, its
# apps and the people who signed up to them.
#
# Request:  {"op": "ensure_app", "args": [...]}
# Answer:   E2E_RESULT {"ok": true, "v": ...} or {"ok": false, "e": "..."}

module E2E
  WORKSPACE_NAME = "e2e-mfa SDK browser tests"
  KEY_PREFIX = "e2e-mfa"

  # Settings every test starts from (the API's own defaults, except: codes
  # instead of links, no passkeys, no attack protection and no notices, so
  # nothing is ever emailed or texted).
  DEFAULTS = {
    identifier_email: true, identifier_phone: false, public_signup: true,
    email_auth_type: "otp", passkeys_enabled: false, webauthn_skip_mfa: true,
    mfa_policy: "disabled", mfa_methods_allowed: %w[totp sms email backup_codes],
    mfa_grace_period_days: 7, mfa_reverify_minutes: 10,
    access_expiration: 3600, refresh_expiration: 604_800, refresh_payload: true,
    auto_refresh: true, test_identities: true,
    security_level: "off", notify_on_new_device: false, notify_on_new_ip: false,
    notify_on_country_change: false, require_verification_new_device: false,
    require_verification_suspicious: true, device_trust_enabled: true, device_trust_days: 30
  }.freeze

  module_function

  def workspace
    ws = Workspace.kept.find_by(name: WORKSPACE_NAME) || Workspace.create!(name: WORKSPACE_NAME)
    ws.generate_rsa_keys! unless ws.keys_generated?
    ws
  end

  def app(public_id)
    workspace.apps.kept.find_by!(public_id: public_id)
  end

  def app_user(public_id, email)
    a = app(public_id)
    a.app_users.joins(:user).find_by!(users: { email: email.downcase })
  end

  # The app by name (made when missing), reset to DEFAULTS, with a new API
  # key; the keys of earlier runs are deleted.
  def ensure_app(name, origin)
    raise "app names start with #{KEY_PREFIX}" unless name.start_with?(KEY_PREFIX)

    ws = workspace
    a = ws.apps.kept.find_by(name: name) || App.create!(workspace: ws, name: name, origin: origin)
    a.update!(origin: origin, **DEFAULTS)
    ws.update!(public_signup: true, user_info_requirement: "identifier_only")
    ApiKey.where(bearer: a).where("nickname LIKE ?", "#{KEY_PREFIX} %").destroy_all
    key = ApiKey.create!(bearer: a, nickname: "#{KEY_PREFIX} #{Time.current.utc.iso8601}")
    { app_id: a.public_id, secret: key.raw_token, workspace_id: ws.id }
  end

  def reset(public_id)
    a = app(public_id)
    a.update!(**DEFAULTS)
    a.workspace.update!(public_signup: true, user_info_requirement: "identifier_only")
    block_all_addresses(public_id, false)
    true
  end

  # The workspace's IP rules: every address blocked, or no rules at all.
  def block_all_addresses(public_id, on)
    ws = app(public_id).workspace
    IpRule.where(workspace_id: ws.id).delete_all
    ws.update!(ip_rules_enforced: on)
    if on
      %w[0.0.0.0/0 ::/0].each do |cidr|
        IpRule.create!(workspace: ws, ip_address: cidr, rule_type: "blocked", reason: "e2e settings suite")
      end
    end
    true
  end

  # Settings the public PATCH /v1/apps/:id doesn't take (attack protection
  # has its own owner-only route).
  def set(public_id, attrs)
    allowed = %w[security_level notify_on_new_device notify_on_new_ip notify_on_country_change
                 require_verification_new_device require_verification_suspicious
                 device_trust_enabled device_trust_days mfa_grace_period_days]
    extra = attrs.keys - allowed
    raise "not settable here: #{extra.join(', ')}" if extra.any?

    app(public_id).update!(attrs)
    true
  end

  def set_workspace(public_id, attrs)
    extra = attrs.keys - %w[public_signup user_info_requirement]
    raise "not settable here: #{extra.join(', ')}" if extra.any?

    app(public_id).workspace.update!(attrs)
    true
  end

  # A sign-in link made like the API makes one, but not sent anywhere.
  def mint_magic_link(public_id, email)
    a = app(public_id)
    au = a.find_or_create_app_user_with_email(email.downcase)
    t = MagicToken.create(30.minutes, { webauthnEnabled: false, uuid: au.id, aid: a.public_id, user_status: au.status, email: au.user&.email })
    ml = MagicLink.create!(app_id: a.id, app_user_id: au.id, token: t.to_jwt(MagicLink::SECRET))
    { id: ml.id, token: ml.token }
  end

  # A link claimed long ago: its status poll is past the API's window.
  def age_magic_link_claim(public_id, id)
    ml = MagicLink.find_by!(id: id, app_id: app(public_id).id)
    ml.update_columns(claimed_at: 10.minutes.ago) if ml.claimed_at
    !ml.claimed_at.nil?
  end

  # banned or suspended (or "none" to lift every flag).
  def flag(public_id, email, type)
    user = app_user(public_id, email).user
    UserFlag.where(user: user, active: true).update_all(active: false, ended_at: Time.current)
    UserFlag.create!(user: user, flag_type: type, reason: "e2e settings suite", active: true) unless type == "none"
    true
  end

  # Make the person older, to be past (or inside) the MFA grace period.
  def backdate(public_id, email, days)
    au = app_user(public_id, email)
    au.update_columns(created_at: days.to_i.days.ago)
    true
  end

  def app_settings(public_id)
    a = app(public_id).reload
    a.attributes.slice(*DEFAULTS.keys.map(&:to_s)).merge("transaction_open" => App.connection.transaction_open?)
  end

  def user_state(public_id, email)
    au = app_user(public_id, email)
    {
      id: au.id,
      status: au.status,
      sessions: TokenSession.where(app_user_id: au.id).count,
      mfa: au.mfa_enrollments.verified.pluck(:method),
      trusted_devices: au.user.user_fingerprints.trusted_now.count
    }
  end

  # The newest sessions of a person: how each was made and whether it knows
  # its device.
  def sessions(public_id, email)
    au = app_user(public_id, email)
    TokenSession.where(app_user_id: au.id).order(created_at: :desc).limit(5).map do |s|
      { type: s.token_session_type, fingerprint: s.fingerprint_hash.present?, created_at: s.created_at.iso8601 }
    end
  end

  def end_sessions(public_id, email)
    au = app_user(public_id, email)
    n = 0
    TokenSession.where(app_user_id: au.id).find_each do |s|
      s.destroy_session
      n += 1
    end
    n
  end
end

STDOUT.sync = true
puts "E2E_READY"
STDIN.each_line do |line|
  begin
    req = JSON.parse(line)
    op = req["op"].to_s
    raise "unknown op #{op}" unless E2E.respond_to?(op) && !%w[workspace app app_user].include?(op)

    # rails runner keeps the query cache on for the whole script; every op
    # must see what the API wrote since the last one.
    value = begin
      ActiveRecord::Base.uncached { E2E.public_send(op, *Array(req["args"])) }
    rescue ActiveRecord::PreparedStatementCacheExpired
      # The schema changed under this long-lived runner (a release): forget
      # the cached statements and try once more.
      ActiveRecord::Base.connection.clear_cache!
      ActiveRecord::Base.uncached { E2E.public_send(op, *Array(req["args"])) }
    end
    # Every write must be committed before the API reads it.
    raise "#{op} left a database transaction open" if ActiveRecord::Base.connection.transaction_open?

    puts "E2E_RESULT #{JSON.generate({ ok: true, v: value })}"
  rescue Exception => e # rubocop:disable Lint/RescueException
    ActiveRecord::Base.connection.reconnect! if ActiveRecord::Base.connection.transaction_open?
    puts "E2E_RESULT #{JSON.generate({ ok: false, e: "#{e.class}: #{e.message}"[0, 500] })}"
  end
end
