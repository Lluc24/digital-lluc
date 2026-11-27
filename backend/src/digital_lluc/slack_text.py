def escape_slack_text(text: str) -> str:
    """Reference: docs.slack.dev/messaging/formatting-message-text#escaping"""
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
