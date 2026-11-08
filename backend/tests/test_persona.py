from digital_lluc.persona import ProfileDocument, compose_system_prompt


def test_system_prompt_keeps_profile_facts_and_drops_yaml_comments() -> None:
    prompt = compose_system_prompt(
        [ProfileDocument("PERSONAL.yaml", "# curation note\nhobbies:\n  - climbing\n")]
    )
    assert prompt.startswith("You are digital-lluc")
    assert "## PERSONAL.yaml\nhobbies:\n- climbing\n" in prompt
    assert "curation note" not in prompt
