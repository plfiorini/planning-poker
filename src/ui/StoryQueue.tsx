import { type FormEvent, useState } from "react";
import { storiesToCsv } from "../domain/csv";
import { randomId } from "../domain/ids";
import type { RoomState } from "../domain/types";
import type { RoomSync } from "../net/roomSync";

const download = (filename: string, content: string) => {
    const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
};

interface Props {
    state: RoomState;
    sync: RoomSync;
    /** Admins manage the queue; participants see it read-only. */
    canEdit: boolean;
}

export const StoryQueue = ({ state, sync, canEdit }: Props) => {
    const [draft, setDraft] = useState("");
    const estimated = state.stories.filter(s => s.estimate !== null).length;

    const add = (event: FormEvent) => {
        event.preventDefault();
        // One story per line, so a list pasted from Jira or a spreadsheet works.
        const stories = draft
            .split("\n")
            .map(title => title.trim())
            .filter(Boolean)
            .map(title => ({ id: randomId(), title: title.slice(0, 200) }));
        if (!stories.length) return;
        sync.dispatch({ type: "addStories", stories });
        setDraft("");
    };

    return (
        <section className="panel stories">
            <div className="row between">
                <h3>Stories</h3>
                <span className="muted">
                    {estimated}/{state.stories.length} estimated
                </span>
            </div>

            {canEdit && (
                <form onSubmit={add}>
                    <label htmlFor="new-stories" className="sr-only">
                        Add stories, one per line
                    </label>
                    <textarea
                        id="new-stories"
                        rows={2}
                        value={draft}
                        onChange={e => setDraft(e.target.value)}
                        onKeyDown={e => {
                            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) add(e);
                        }}
                        placeholder="Add stories, one per line"
                    />
                    <button type="submit" className="wide" disabled={!draft.trim()}>
                        Add
                    </button>
                </form>
            )}

            <ol className="story-list">
                {state.stories.map((story, i) => {
                    const current = story.id === state.currentStoryId;
                    return (
                        <li key={story.id} className={current ? "current" : ""}>
                            {canEdit ? (
                                <button
                                    type="button"
                                    className="title"
                                    onClick={() => sync.dispatch({ type: "selectStory", storyId: story.id })}
                                    title={current ? "Being estimated" : "Estimate this story now"}
                                    aria-current={current}
                                >
                                    {story.title}
                                </button>
                            ) : (
                                <span className="title" aria-current={current}>
                                    {story.title}
                                </span>
                            )}
                            <span className="estimate">{story.estimate ?? ""}</span>
                            {canEdit && (
                                <span className="actions">
                                    <button
                                        type="button"
                                        className="icon"
                                        aria-label="Move up"
                                        disabled={i === 0}
                                        onClick={() =>
                                            sync.dispatch({ type: "moveStory", storyId: story.id, offset: -1 })
                                        }
                                    >
                                        ↑
                                    </button>
                                    <button
                                        type="button"
                                        className="icon"
                                        aria-label="Move down"
                                        disabled={i === state.stories.length - 1}
                                        onClick={() =>
                                            sync.dispatch({ type: "moveStory", storyId: story.id, offset: 1 })
                                        }
                                    >
                                        ↓
                                    </button>
                                    <button
                                        type="button"
                                        className="icon"
                                        aria-label="Remove"
                                        onClick={() => sync.dispatch({ type: "removeStory", storyId: story.id })}
                                    >
                                        ×
                                    </button>
                                </span>
                            )}
                        </li>
                    );
                })}
            </ol>

            {state.stories.length > 0 && (
                <button
                    type="button"
                    className="wide"
                    onClick={() =>
                        download(`estimates-${new Date().toISOString().slice(0, 10)}.csv`, storiesToCsv(state.stories))
                    }
                >
                    Export CSV
                </button>
            )}
        </section>
    );
};
