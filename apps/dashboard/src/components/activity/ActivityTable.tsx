"use client";

import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import type { ScuteEvent } from "@/types";
import styles from "@/styles/Table.module.scss";
import { shortString } from "@/utils/string";
import { Code, Flex, IconButton, Kbd, Tooltip } from "@radix-ui/themes";
import { toast } from "sonner";
import { CopyIcon } from "@radix-ui/react-icons";

interface ActivityTableProps {
  events: ScuteEvent[];
}

export const ActivitiyTable = ({ events }: ActivityTableProps) => {
  const table = useReactTable({
    data: events,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
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
  );
};

const columnHelper = createColumnHelper<ScuteEvent>();

const columns = [
  columnHelper.accessor("user.id", {
    cell: (info) => (
      <Flex gap="1">
        <Tooltip content={info.getValue()}>
          <Kbd size="1">{shortString(info.getValue() as string, 8)}</Kbd>
        </Tooltip>
        <IconButton
          color="gray"
          size="1"
          variant="ghost"
          onClick={() =>
            navigator.clipboard
              .writeText(info.getValue() as string)
              .then(() => {
                toast.success("Copied!");
              })
          }
        >
          <CopyIcon />
        </IconButton>
      </Flex>
    ),
    header: () => <span>User ID</span>,
  }),
  // TODO: backend
  // columnHelper.accessor("user.email", {
  //   header: () => <span>Email</span>,
  // }),
  columnHelper.accessor("slug", {
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
