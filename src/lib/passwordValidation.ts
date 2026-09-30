export function getPasswordPairErrors(password: string, confirmation: string) {
  return {
    newPassword: !password
      ? "请输入新密码。"
      : password.length < 8
        ? "新密码至少需要 8 位。"
        : "",
    confirmPassword: !confirmation
      ? "请再次输入新密码。"
      : password !== confirmation
        ? "两次输入的新密码不一致。"
        : "",
  };
}
