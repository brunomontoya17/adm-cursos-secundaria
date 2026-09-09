import { tableFeatures, useTable, type ColumnDef } from "@tanstack/react-table";

export const tableFeaturesBase = tableFeatures({});

type DataTableProps<TData extends object> = {
  columns: ColumnDef<typeof tableFeaturesBase, TData, unknown>[];
  data: TData[];
  empty: string;
};

export function DataTable<TData extends object>({
  columns,
  data,
  empty,
}: DataTableProps<TData>) {
  const table = useTable({
    features: tableFeaturesBase,
    columns,
    data,
  });

  const rows = table.getRowModel().rows;

  return (
    <div className="overflow-x-auto border border-navy/15">
      <table className="w-full border-collapse text-left text-sm">
        <thead className="bg-navy text-cream">
          {table.getHeaderGroups().map((group) => (
            <tr key={group.id}>
              {group.headers.map((header) => (
                <th key={header.id} className="px-3 py-2 font-medium">
                  {header.isPlaceholder ? null : <table.FlexRender header={header} />}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td className="px-3 py-6 text-sky" colSpan={Math.max(columns.length, 1)}>
                {empty}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={row.id} className="border-t border-navy/10 hover:bg-cream/70">
                {row.getAllCells().map((cell) => (
                  <td key={cell.id} className="px-3 py-2 align-middle">
                    <table.FlexRender cell={cell} />
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
