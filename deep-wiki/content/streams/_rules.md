
A paragraph that is just `INCLUSION` is where a live stream's messages go: a
repeat of `message` widgets whose items come from the `dstream` source (the
server on port 8765). The source is asked each time the note opens.

```omni type=rules
- id: inclusion
  on: para
  where: note,chat
  emit: html-repeat
  with: pattern=message; itemsFrom=stream; itemsSource=dstream; class=inclusion; failText=Stream was not available
  match: ^INCLUSION$
```
