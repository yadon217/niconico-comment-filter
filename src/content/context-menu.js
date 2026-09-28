import { createId } from "../shared/schema.js";
import { findCommentListSection } from "./comment-adapter.js";

export function installContextMenu({ onNgUser, onNgWord, resolveComment }) {
  const menu = document.createElement("div");
  menu.className = "ncf-menu";
  menu.hidden = true;
  document.documentElement.appendChild(menu);

  const hide = () => {
    menu.hidden = true;
    menu.replaceChildren();
  };

  const addItem = (label, handler) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.addEventListener("click", (event) => {
      event.preventDefault();
      handler();
      hide();
    });
    menu.appendChild(button);
  };

  document.addEventListener(
    "contextmenu",
    (event) => {
      const section = findCommentListSection();
      if (!section || !event.target || !section.contains(event.target)) {
        hide();
        return;
      }
      const comment = resolveComment(event.target);
      if (!comment) return;
      event.preventDefault();
      menu.replaceChildren();
      if (comment.userId) {
        addItem("このユーザーをNG", () => onNgUser(comment.userId));
        addItem("ユーザーIDをコピー", async () => {
          try {
            await navigator.clipboard.writeText(comment.userId);
          } catch {
            // ignore
          }
        });
      } else {
        addItem("ユーザーIDを取得できません", () => {});
      }
      if (comment.text) {
        addItem("このワードをNGに追加", () => onNgWord(comment.text));
        addItem("コメント内容をコピー", async () => {
          try {
            await navigator.clipboard.writeText(comment.text);
          } catch {
            // ignore
          }
        });
      }
      menu.hidden = false;
      menu.style.left = `${event.clientX}px`;
      menu.style.top = `${event.clientY}px`;
    },
    true,
  );

  document.addEventListener("click", hide, true);
  window.addEventListener("blur", hide);

  return { hide, createId };
}
