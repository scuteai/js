"use client";

import styles from "@/styles/Table.module.scss";
import {
  Flex,
  Container,
  IconButton,
  Kbd,
  Tooltip,
  Code,
} from "@radix-ui/themes";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { CopyIcon } from "@radix-ui/react-icons";
import { shortString } from "@/utils/string";
import type { ScuteEvent } from "@/types/event";

export default function AppActivities({ params }: { params: { id: string } }) {
  const appId = params.id;

  const table = useReactTable({
    data: exampleData,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <Container size="3">
      <table className={styles.table}>
        <thead>
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <th
                  key={header.id}
                  colSpan={header.colSpan}
                  className={styles.th}
                >
                  {header.isPlaceholder ? null : (
                    <div
                      {...{
                        className: header.column.getCanSort()
                          ? "cursor-pointer select-none"
                          : "",
                        onClick: header.column.getToggleSortingHandler(),
                      }}
                    >
                      {flexRender(
                        header.column.columnDef.header,
                        header.getContext()
                      )}
                      {{
                        asc: " 🔼",
                        desc: " 🔽",
                      }[header.column.getIsSorted() as string] ?? null}
                    </div>
                  )}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody className={styles.tbody}>
          {table.getRowModel().rows.map((row) => (
            <tr key={row.id} className={styles.tr}>
              {row.getVisibleCells().map((cell) => (
                <td key={cell.id} className={styles.td}>
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </Container>
  );
}

const exampleData: ScuteEvent[] = [
  {
    user_id: "e240303b-e261-416f-b0af-7d70239125f7",
    email: "t@linsley.com",
    event: "webauthn.register.initiated",
    created_at: "2021-01-01",
    ip_address: "127.0.0.1",
    user_agent: "Chrome OSX 4.1 blabla",
  },
  {
    user_id: "e240303b-e261-416f-b0af-7d70239125f7",
    email: "t1@linsley.com",
    event: "webauthn.register.initiated",
    created_at: "2021-01-01",
    ip_address: "127.0.0.1",
    user_agent: "Chrome OSX 4.1 blabla",
  },
];

const columnHelper = createColumnHelper<ScuteEvent>();

const columns = [
  columnHelper.accessor("user_id", {
    cell: (info) => (
      <Flex gap="1">
        <Tooltip content={info.getValue()}>
          <Kbd size="1">{shortString(info.getValue(), 8)}</Kbd>
        </Tooltip>
        <IconButton color="gray" size="1" variant="ghost">
          <CopyIcon />
        </IconButton>
      </Flex>
    ),
    header: () => <span>User ID</span>,
  }),
  columnHelper.accessor("email", {
    header: () => <span>Email</span>,
  }),
  columnHelper.accessor("event", {
    cell: (info) => (
      <Code size="1" color="blue" variant="soft" weight="light">
        {info.getValue()}
      </Code>
    ),
    header: () => <span>Action</span>,
  }),
  columnHelper.accessor("created_at", {
    header: () => <span>Created At</span>,
  }),
];
