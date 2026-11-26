import {ConsoleLoading} from '@/components/console-loading'
// Same loading shell as the rest of the console (navigation + "Opening …"),
// not a bare "Loading…" heading — e.g. while Post a job opens.
export default function JobsLoading(){return <ConsoleLoading/>}
