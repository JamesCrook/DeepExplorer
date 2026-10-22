
```omni type=rules
- id: inclusion
  on: para
  where: note,chat
  emit: inclusion
  with: name=$<name>
  match: ^INCLUSION$
```