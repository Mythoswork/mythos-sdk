## Title

<!-- Delete this section after adding the title  -->

`<type>(<scope>): <description>`

**Common Types:**

- feat: New feature
- fix: Bug fix
- docs: Documentation changes
- style: Code style changes (formatting, no logic changes)
- refactor: Code refactoring
- test: Adding or updating tests
- chore: Maintenance tasks, dependency updates

**Description Field:**

- Recommended to start a `<description>` with a verb (add, resolve, update, etc.)

**Examples:**

- feat(auth): add OAuth2 login integration
- fix(api): resolve null pointer exception in user service
- docs(readme): update installation instructions
- refactor(database): optimize query performance
- feat(BE): add vector DB connection
- fix(FE): login redirection

## Summary

<!-- Brief description of what this PR does and why it's needed -->
<!-- Can be taken from the Copilot summary -->

## How to Test

<!-- Provide clear steps for reviewers to test your changes -->

1. Step 1
2. Step 2
3. Expected result

## Related Issues

<!-- Link related issues using: Closes #123, Fixes #456, Related to #789 -->

## Author Checklist

<!-- Set items as strikethrough if they are not necessary  -->

- [ ] Code follows team coding standards and style guide
- [ ] Self-reviewed the code changes
- [ ] Added/updated tests for new functionality
- [ ] All tests pass locally
- [ ] Code is properly documented
- [ ] Synced with latest `main` branch
- [ ] PR title follows conventional commit format
- [ ] Meaningful commit messages used
- [ ] Add AI Feedback Author comment (after PR is merged)

```
AI Feedback: Author
[numbering] TP/FP | (Impact) Suggestion | author notes

model: model-1, model-2, ...
note: -
```

**Example:**
```
AI Feedback: Author
1. TP | (High) Consider refactoring the data access layer for better performance | Fixed as suggested.
2. FP | (Low) Minor typo in variable naming | False positive, naming follows existing conventions.
3. FP | (High) Replace invalid `getFirst()` call | The method is valid for the Python version we use.

model: gpt-4, claude-sonnet-4
note: AI reviewer suggested improvements that improved code quality. Some suggestions were false positives due to version differences.
```

**Legend:**
- `TP`: True Positive (valid suggestion)
- `FP`: False Positive (invalid suggestion)
- `High`, `Medium`, `Low`: Impact level of the suggestion
- `note`: Action taken, lessons learned, or reason for disagreement

## Reviewer Checklist

- [ ] Comment `START REVIEW` before reviewing, once per PR
  - Review timing is measured from "START REVIEW" to last activity before merge
- [ ] Add AI Feedback Reviewer comment (after PR is merged)

```
AI Feedback: Reviewer
model: model-1, model-2, ...
note: -
```

**Example:**
```
AI Feedback: Reviewer
model: copilot(auto), claude-sonnet-4
note: AI helped identify potential race condition in async handler. AI suggested more efficient algorithm for data processing that improved performance by 30%.
```

**Legend:**
- `model`: AI models used during review (e.g., copilot, claude, gpt-4)
- `note`: Lessons learned and improvement suggestions summary
