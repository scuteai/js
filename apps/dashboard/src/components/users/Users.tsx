"use client";
import type { ScuteUserData, UniqueIdentifier } from "@/types";

import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { shortString } from "@/utils/string";

import { Flex, Container, IconButton, Kbd, Tooltip } from "@radix-ui/themes";
import styles from "@/styles/Table.module.scss";

import { CopyIcon } from "@radix-ui/react-icons";
import { AppUserActions } from "./AppUserActions";
import { toast } from "sonner";

interface UsersProps {
  appId: UniqueIdentifier;
  users: ScuteUserData[];
}

const columnHelper = createColumnHelper<ScuteUserData>();

export const Users = ({ appId, users }: UsersProps) => {
  const columns = [
    columnHelper.accessor("id", {
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

    columnHelper.accessor("email", {
      header: () => <span>Email</span>,
    }),
    columnHelper.accessor("status", {
      header: () => <span>Active</span>,
    }),
    columnHelper.display({
      id: "actions",
      cell: (props) => (
        <AppUserActions appId={appId} user={props.row.original} />
      ),
    }),
  ];

  const table = useReactTable({
    data: users,
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
};
