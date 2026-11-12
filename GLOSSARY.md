# Glossary

The words this project uses for the game. The design is in [`docs/design.md`](./docs/design.md).

## Cases and games

- **Case:** one mystery, a JSON file in `cases/`. It holds the answer, so only the Worker and local tooling read it.
- **Game:** one playthrough of a case, named by `gameId` and run by one Durable Object.
- **Detective:** the player.
- **Thief:** the guest who took the item. Secret server state.
- **Guest:** a character the detective can question. A case has four or five.
- **Fact:** one checkable statement in a case, true or false. Messages carry facts; the client never sees them.
- **Claim:** a false fact a guest says. **Secret:** a true fact an innocent hides, which never concerns the theft.
- **Contradiction:** a claim of one guest's and the true fact that disproves it, its proof.
- **Theft fact:** the fact that names the thief. Only the timeline carries it.
- **Timeline:** what really happened, night by night, revealed at the end.

## Time

- **Day:** one of three. Day 1 is the morning after the theft; day 3 ends with the arrest.
- **Night:** night 0 is the theft. On nights 1 and 2 the thief makes a **night move**: Destroy, Plant or Coach.
- **Part:** morning, afternoon or evening. Each day has all three.
- **Tick:** the unit of time. Each part has a budget of ticks, set per case. Asking, pressing and right proof cost one; wrong proof costs two.
- **Away schedule:** the parts of each day a guest is out, each with a status line. A guest who's away can't be asked anything.
- **Quiet:** a guest who was shown wrong proof. They won't answer until the next part.
- **Bedtime:** evening has run out. Only Go to sleep remains.

## Questioning

- **Question:** one thing the detective can ask, as the exact text they'll send. Each is asked once.
- **Menu:** the chips of a thread's available questions.
- **Unlock:** what a question needs before it reaches a menu: a fact **seen**, a lie **caught**, a question **asked**, or a night passed.
- **Seen:** posted where the detective can read it, in any reply, Wi-Fi entry or beat. Saving isn't needed.
- **Answer:** a guest's reply to a question, one to three bubbles.
- **Press:** "Are you sure about that?" on an answer. Once per answer.
- **Show proof** (confront): pick a saved item to prove an answer is a lie. Right proof catches the lie; wrong proof costs ticks and the guest goes quiet.
- **Caught:** a lie proved by right proof. The answer and its proof get a ✓ caught stamp.
- **Tell:** what a coached guest admits when pressed.
- **Beat:** authored group-chat lines that post when a part starts. Every day has a morning beat.
- **Group question:** a question asked in the group chat. Whether these stay is undecided; a case may have none.

## Evidence

- **Board:** the client's copy of what the detective can see.
- **Case file:** the messages and Wi-Fi entries the detective saved.
- **Wi-Fi log:** the true record of phones joining and leaving the network, published the morning after each night.
- **Arrest:** a suspect plus one caught lie against them. Ends in case closed, they walk, or wrong person.

## Retired words

**Patience, topic, dictionary, temperament, Clef, composer, small talk, idle beat** belonged to the free-typing design and are gone.
