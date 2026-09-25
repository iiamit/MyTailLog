-- Android uses FCM tokens; iOS continues to use APNs tokens. A token still
-- belongs to one account at a time through register_device_token().
alter table device_token drop constraint if exists device_token_platform_check;
alter table device_token add constraint device_token_platform_check
  check (platform in ('ios', 'android'));
