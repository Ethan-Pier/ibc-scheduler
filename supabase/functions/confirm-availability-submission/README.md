## confirm-availability-submission

这个 Edge Function 负责一件事：在学生点击“确认排班”后，先尝试保存给班，再向管理员固定邮箱发送变更通知；如果邮件发送失败，会尽量把数据库回滚到确认前状态。

部署前需要配置以下 Supabase Function Secrets：

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`
- `ADMIN_NOTIFICATION_EMAIL`

前端如果想在弹窗里显示脱敏后的收件邮箱提示，可以额外在项目环境变量里配置：

- `VITE_ADMIN_NOTIFICATION_EMAIL_HINT`
